from dotenv import load_dotenv
from pathlib import Path
import os

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import logging
import secrets
import hashlib
from datetime import datetime, timezone, timedelta, date
from typing import Optional

import bcrypt
import jwt
import httpx
from html import escape
from urllib.parse import urlparse

from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends, BackgroundTasks, Query
from starlette.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select, func, delete, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.inspection import inspect as sa_inspect

from database import AsyncSessionLocal, get_db
from models import User, Goal, Task, LoginAttempt, PasswordResetRequest, PasswordResetToken, utcnow

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

app = FastAPI()
api_router = APIRouter(prefix="/api")


# ---------------------------------------------------------------------------
# Serialization
# ---------------------------------------------------------------------------
def to_dict(obj, exclude=("password_hash",)) -> dict:
    if obj is None:
        return None
    d = {c.key: getattr(obj, c.key) for c in sa_inspect(obj).mapper.column_attrs}
    for e in exclude:
        d.pop(e, None)
    for k, v in list(d.items()):
        if isinstance(v, datetime):
            d[k] = v.isoformat()
    return d


# ---------------------------------------------------------------------------
# Auth utils
# ---------------------------------------------------------------------------
JWT_ALGORITHM = "HS256"


def get_jwt_secret() -> str:
    return os.environ["JWT_SECRET"]


def hash_password(password: str) -> str:
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def create_access_token(user_id: str, email: str, token_version: int = 0) -> str:
    payload = {"sub": user_id, "email": email, "ver": token_version,
               "exp": datetime.now(timezone.utc) + timedelta(minutes=15), "type": "access"}
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


def create_refresh_token(user_id: str, token_version: int = 0) -> str:
    payload = {"sub": user_id, "ver": token_version,
               "exp": datetime.now(timezone.utc) + timedelta(days=7), "type": "refresh"}
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


def set_auth_cookies(response: Response, access: str, refresh: str):
    response.set_cookie("access_token", access, httponly=True, secure=True, samesite="none", max_age=900, path="/")
    response.set_cookie("refresh_token", refresh, httponly=True, secure=True, samesite="none", max_age=604800, path="/")


async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
        async with AsyncSessionLocal() as db:
            user = (await db.execute(select(User).where(User.id == payload["sub"]))).scalar_one_or_none()
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        if payload.get("ver", 0) != (user.token_version or 0):
            raise HTTPException(status_code=401, detail="Session expired")
        return to_dict(user)
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


async def require_founder(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "founder":
        raise HTTPException(status_code=403, detail="Only the founder/manager can perform this action")
    return user


# ---------------------------------------------------------------------------
# Brute force
# ---------------------------------------------------------------------------
async def is_locked_out(db: AsyncSession, identifier: str) -> bool:
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=15)
    count = (await db.execute(
        select(func.count()).select_from(LoginAttempt).where(
            LoginAttempt.identifier == identifier, LoginAttempt.created_at > cutoff))).scalar()
    return (count or 0) >= 5


async def record_failed_attempt(db: AsyncSession, identifier: str, email: str):
    db.add(LoginAttempt(identifier=identifier, email=email))
    await db.commit()


async def clear_attempts(db: AsyncSession, identifier: str, email: str):
    await db.execute(delete(LoginAttempt).where(
        (LoginAttempt.identifier == identifier) | (LoginAttempt.email == email)))
    await db.commit()


# ---------------------------------------------------------------------------
# Password reset email
# ---------------------------------------------------------------------------
EMAIL_BASE_URL = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip().rstrip("/") or "https://integrations.emergentagent.com"
EMAIL_KEY = os.environ.get("EMERGENT_EMAIL_KEY", "")
EMAIL_FROM_NAME = os.environ.get("EMAIL_FROM_NAME") or "Your App"


async def send_password_reset_email(to_email: str, token: str) -> bool:
    base = os.environ.get("FRONTEND_URL", "").split(",")[0].strip().rstrip("/")
    link = f"{base}/reset-password?token={token}"
    if not EMAIL_KEY or EMAIL_KEY.startswith("{") or not base.startswith("https://"):
        if urlparse(base).hostname in ("localhost", "127.0.0.1", "::1"):
            logger.warning("Email not configured; password reset link: %s", link)
        else:
            logger.error("Password reset email not configured (EMERGENT_EMAIL_KEY / FRONTEND_URL)")
        return False
    brand = escape(EMAIL_FROM_NAME)
    html = (
        f'<table role="presentation" width="100%"><tr><td style="padding:24px;font-family:Arial,sans-serif">'
        f'<p>We received a request to reset your {brand} password.</p>'
        f'<p><a href="{escape(link)}">Reset your password</a></p>'
        f'<p>This link expires in 1 hour and can be used once. If you did not request it, ignore this email.</p>'
        f'<p style="font-size:12px;color:#888">Sent by {brand}. We never ask for your password by email.</p>'
        f'</td></tr></table>'
    )
    try:
        async with httpx.AsyncClient(timeout=30) as http_client:
            resp = await http_client.post(
                f"{EMAIL_BASE_URL}/api/v1/email/send",
                headers={"X-Email-Key": EMAIL_KEY},
                json={"to": [to_email], "subject": f"Reset your {EMAIL_FROM_NAME} password",
                      "html": html, "from_name": EMAIL_FROM_NAME},
            )
        resp.raise_for_status()
        return True
    except Exception as e:
        logger.error(f"Password reset email failed: {e}")
        return False


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------
class RegisterIn(BaseModel):
    email: str
    password: str
    name: Optional[str] = ""
    role: Optional[str] = "designer"


class LoginIn(BaseModel):
    email: str
    password: str


class ForgotIn(BaseModel):
    email: str


class ResetIn(BaseModel):
    token: str
    password: str


class GoalIn(BaseModel):
    model_config = ConfigDict(extra="ignore")
    goal_type: str = "Daily"
    category: str = "Pitching"
    goal_name: str
    target_number: float = 0
    unit: Optional[str] = ""
    owner: str = "Founder"
    founder_responsibility: Optional[str] = ""
    designer_responsibility: Optional[str] = ""
    frequency: str = "Daily"
    status: str = "Active"


class TaskIn(BaseModel):
    model_config = ConfigDict(extra="ignore")
    date: str
    task_type: str = "Founder Task"
    work_category: str = "Internal Work"
    task_name: str
    assigned_to: str = ""
    brief: Optional[str] = ""
    priority: str = "Medium"
    manager_deadline: Optional[str] = ""
    committed_time: Optional[str] = ""
    status: str = "Pending"
    delay_reason: Optional[str] = ""
    output_link: Optional[str] = ""
    review_notes: Optional[str] = ""
    target_number: Optional[float] = None
    unit: Optional[str] = ""
    goal_id: Optional[str] = None


class TaskUpdate(BaseModel):
    model_config = ConfigDict(extra="ignore")
    task_type: Optional[str] = None
    work_category: Optional[str] = None
    task_name: Optional[str] = None
    assigned_to: Optional[str] = None
    brief: Optional[str] = None
    priority: Optional[str] = None
    manager_deadline: Optional[str] = None
    committed_time: Optional[str] = None
    status: Optional[str] = None
    delay_reason: Optional[str] = None
    output_link: Optional[str] = None
    review_notes: Optional[str] = None
    date: Optional[str] = None


# ---------------------------------------------------------------------------
# Auth endpoints
# ---------------------------------------------------------------------------
@api_router.post("/auth/register")
async def register(payload: RegisterIn, response: Response, db: AsyncSession = Depends(get_db)):
    email = payload.email.strip().lower()
    existing = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    role = payload.role if payload.role in ("founder", "designer") else "designer"
    user = User(email=email, password_hash=hash_password(payload.password),
                name=payload.name or email.split("@")[0], role=role, token_version=0)
    db.add(user)
    await db.commit()
    await db.refresh(user)
    set_auth_cookies(response, create_access_token(user.id, email, 0), create_refresh_token(user.id, 0))
    return to_dict(user)


@api_router.post("/auth/login")
async def login(payload: LoginIn, request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    email = payload.email.strip().lower()
    ip = request.client.host if request.client else "unknown"
    identifier = f"{ip}:{email}"
    if await is_locked_out(db, identifier):
        raise HTTPException(status_code=429, detail="Too many failed attempts. Try again in 15 minutes.")
    user = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
    if not user or not verify_password(payload.password, user.password_hash):
        await record_failed_attempt(db, identifier, email)
        raise HTTPException(status_code=401, detail="Invalid email or password")
    await clear_attempts(db, identifier, email)
    ver = user.token_version or 0
    set_auth_cookies(response, create_access_token(user.id, email, ver), create_refresh_token(user.id, ver))
    return to_dict(user)


@api_router.post("/auth/logout")
async def logout(response: Response, user: dict = Depends(get_current_user)):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return {"message": "Logged out"}


@api_router.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user


@api_router.post("/auth/refresh")
async def refresh(request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = (await db.execute(select(User).where(User.id == payload["sub"]))).scalar_one_or_none()
        if not user or payload.get("ver", 0) != (user.token_version or 0):
            raise HTTPException(status_code=401, detail="Session expired")
        ver = user.token_version or 0
        set_auth_cookies(response, create_access_token(user.id, user.email, ver), create_refresh_token(user.id, ver))
        return {"message": "refreshed"}
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


GENERIC_RESET = {"message": "If that email is registered, a reset link has been sent."}


@api_router.post("/auth/forgot-password")
async def forgot_password(payload: ForgotIn, background_tasks: BackgroundTasks, db: AsyncSession = Depends(get_db)):
    email = payload.email.strip().lower()
    now = datetime.now(timezone.utc)
    db.add(PasswordResetRequest(email=email))
    await db.commit()
    cutoff = now - timedelta(minutes=15)
    recent = (await db.execute(
        select(func.count()).select_from(PasswordResetRequest).where(
            PasswordResetRequest.email == email, PasswordResetRequest.created_at > cutoff))).scalar()
    if (recent or 0) > 5:
        return GENERIC_RESET
    user = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
    if not user:
        return GENERIC_RESET
    raw = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(raw.encode()).hexdigest()
    db.add(PasswordResetToken(token_hash=token_hash, user_id=user.id, email=email,
                              expires_at=now + timedelta(hours=1), used=False))
    await db.commit()
    background_tasks.add_task(send_password_reset_email, user.email, raw)
    return GENERIC_RESET


@api_router.post("/auth/reset-password")
async def reset_password(payload: ResetIn, db: AsyncSession = Depends(get_db)):
    token_hash = hashlib.sha256(payload.token.encode()).hexdigest()
    now = datetime.now(timezone.utc)
    tok = (await db.execute(select(PasswordResetToken).where(
        PasswordResetToken.token_hash == token_hash,
        PasswordResetToken.used == False,
        PasswordResetToken.expires_at > now))).scalar_one_or_none()
    if not tok:
        raise HTTPException(status_code=400, detail="Invalid or expired reset link")
    tok.used = True
    user = (await db.execute(select(User).where(User.id == tok.user_id))).scalar_one_or_none()
    if user:
        user.password_hash = hash_password(payload.password)
        user.token_version = (user.token_version or 0) + 1
    await db.execute(delete(PasswordResetToken).where(
        PasswordResetToken.user_id == tok.user_id, PasswordResetToken.used == False))
    await db.execute(delete(LoginAttempt).where(LoginAttempt.email == tok.email))
    await db.commit()
    return {"message": "Password updated. You can now sign in."}


# ---------------------------------------------------------------------------
# Goals <-> Tasks logic
# ---------------------------------------------------------------------------
CATEGORY_TO_WORK = {
    "Pitching": "Pitching Work",
    "Conversion": "Pitching Work",
    "Social Media": "Social Media",
    "IP": "Agency Growth",
    "Personal Brand": "Agency Growth",
    "Business": "Agency Growth",
    "Learning": "Learning",
    "Finance": "Finance",
}


def should_generate(goal: Goal, d: date) -> bool:
    freq = goal.frequency or "Daily"
    if freq == "Daily":
        return True
    if freq == "Alternate Day":
        return d.toordinal() % 2 == 0
    if freq == "Weekly":
        return d.weekday() == 0
    if freq == "Monthly":
        return d.day == 1
    return False


def task_type_for_owner(owner: str) -> str:
    return "Founder Task" if "Founder" in (owner or "") else "Designer Task"


def compute_delayed(task: Task) -> bool:
    if task.status in ("Done", "Sent for Review"):
        return False
    if task.status == "Delayed":
        return True
    d = task.date
    if d:
        try:
            if datetime.strptime(d, "%Y-%m-%d").date() < datetime.now().date():
                return True
        except Exception:
            pass
    return False


def serialize_task(task: Task) -> dict:
    t = to_dict(task)
    t["is_delayed"] = compute_delayed(task)
    return t


async def ensure_tasks_for_date(db: AsyncSession, d: date):
    date_str = d.isoformat()
    goals = (await db.execute(select(Goal).where(Goal.status == "Active"))).scalars().all()
    created = False
    for goal in goals:
        if not should_generate(goal, d):
            continue
        exists = (await db.execute(select(Task).where(
            Task.goal_id == goal.id, Task.date == date_str, Task.auto_generated == True))).scalar_one_or_none()
        if exists:
            continue
        ttype = task_type_for_owner(goal.owner)
        db.add(Task(
            date=date_str,
            task_type=ttype,
            work_category=CATEGORY_TO_WORK.get(goal.category or "", "Internal Work"),
            task_name=goal.goal_name or "Untitled",
            assigned_to="Founder" if ttype == "Founder Task" else "Designer",
            brief=goal.founder_responsibility or goal.designer_responsibility or "",
            priority="Medium",
            manager_deadline="",
            committed_time="",
            status="Pending",
            delay_reason="",
            output_link="",
            review_notes="",
            target_number=goal.target_number,
            unit=goal.unit or "",
            goal_id=goal.id,
            auto_generated=True,
        ))
        created = True
    if created:
        await db.commit()


# ---------------------------------------------------------------------------
# Goals endpoints
# ---------------------------------------------------------------------------
@api_router.get("/goals")
async def list_goals(user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    goals = (await db.execute(select(Goal).order_by(Goal.created_at.asc()))).scalars().all()
    return [to_dict(g) for g in goals]


@api_router.post("/goals")
async def create_goal(payload: GoalIn, user: dict = Depends(require_founder), db: AsyncSession = Depends(get_db)):
    goal = Goal(**payload.model_dump())
    db.add(goal)
    await db.commit()
    await db.refresh(goal)
    await ensure_tasks_for_date(db, date.today())
    return to_dict(goal)


@api_router.put("/goals/{goal_id}")
async def update_goal(goal_id: str, payload: GoalIn, user: dict = Depends(require_founder), db: AsyncSession = Depends(get_db)):
    goal = (await db.execute(select(Goal).where(Goal.id == goal_id))).scalar_one_or_none()
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    data = payload.model_dump()
    old_target, old_unit, old_name = goal.target_number, goal.unit, goal.goal_name
    for k, v in data.items():
        setattr(goal, k, v)
    task_updates = {}
    if data.get("target_number") != old_target:
        task_updates["target_number"] = data.get("target_number")
    if data.get("unit") != old_unit:
        task_updates["unit"] = data.get("unit")
    if data.get("goal_name") != old_name:
        task_updates["task_name"] = data.get("goal_name")
    if task_updates:
        await db.execute(update(Task).where(Task.goal_id == goal_id, Task.status != "Done").values(**task_updates))
    await db.commit()
    await db.refresh(goal)
    return to_dict(goal)


@api_router.delete("/goals/{goal_id}")
async def delete_goal(goal_id: str, user: dict = Depends(require_founder), db: AsyncSession = Depends(get_db)):
    await db.execute(delete(Goal).where(Goal.id == goal_id))
    await db.execute(delete(Task).where(
        Task.goal_id == goal_id, Task.auto_generated == True, Task.status != "Done"))
    await db.commit()
    return {"message": "Goal deleted"}


# ---------------------------------------------------------------------------
# Tasks endpoints
# ---------------------------------------------------------------------------
@api_router.get("/tasks")
async def list_tasks(
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    date: Optional[str] = Query(None),
    assigned_to: Optional[str] = Query(None),
    task_type: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    priority: Optional[str] = Query(None),
    work_category: Optional[str] = Query(None),
):
    await ensure_tasks_for_date(db, datetime.now().date())
    stmt = select(Task)
    if date:
        stmt = stmt.where(Task.date == date)
    if assigned_to:
        stmt = stmt.where(Task.assigned_to == assigned_to)
    if task_type:
        stmt = stmt.where(Task.task_type == task_type)
    if status:
        stmt = stmt.where(Task.status == status)
    if priority:
        stmt = stmt.where(Task.priority == priority)
    if work_category:
        stmt = stmt.where(Task.work_category == work_category)
    tasks = (await db.execute(stmt.order_by(Task.date.desc()))).scalars().all()
    return [serialize_task(t) for t in tasks]


@api_router.post("/tasks")
async def create_task(payload: TaskIn, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    data = payload.model_dump()
    role = user.get("role")
    if role == "founder":
        tt = data.get("task_type") if data.get("task_type") in ("Founder Task", "Designer Task") else "Founder Task"
    else:
        tt = "Designer Task"
    data["task_type"] = tt
    data["assigned_to"] = "Founder" if tt == "Founder Task" else "Designer"
    data["auto_generated"] = False
    task = Task(**data)
    db.add(task)
    await db.commit()
    await db.refresh(task)
    return serialize_task(task)


@api_router.put("/tasks/{task_id}")
async def update_task(task_id: str, payload: TaskUpdate, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    task = (await db.execute(select(Task).where(Task.id == task_id))).scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    data = {k: v for k, v in payload.model_dump().items() if v is not None}
    if user.get("role") != "founder":
        allowed = {"status", "committed_time", "delay_reason", "output_link"}
        data = {k: v for k, v in data.items() if k in allowed}
    elif data.get("task_type") in ("Founder Task", "Designer Task"):
        data["assigned_to"] = "Founder" if data["task_type"] == "Founder Task" else "Designer"
    for k, v in data.items():
        setattr(task, k, v)
    await db.commit()
    await db.refresh(task)
    return serialize_task(task)


@api_router.delete("/tasks/{task_id}")
async def delete_task(task_id: str, user: dict = Depends(require_founder), db: AsyncSession = Depends(get_db)):
    await db.execute(delete(Task).where(Task.id == task_id))
    await db.commit()
    return {"message": "Task deleted"}


# ---------------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------------
@api_router.get("/dashboard")
async def dashboard(user: dict = Depends(get_current_user),
                    db: AsyncSession = Depends(get_db),
                    date: Optional[str] = Query(None),
                    month: Optional[str] = Query(None)):
    today = datetime.now().date()
    sel_date = date or today.isoformat()
    sel_month = month or today.strftime("%Y-%m")

    await ensure_tasks_for_date(db, today)

    today_task_objs = (await db.execute(select(Task).where(Task.date == sel_date))).scalars().all()
    today_tasks = [serialize_task(t) for t in today_task_objs]

    def count_status(tasks, s):
        return sum(1 for t in tasks if t.get("status") == s)

    delayed = [t for t in today_tasks if t.get("is_delayed")]
    stats = {
        "total": len(today_tasks),
        "completed": count_status(today_tasks, "Done"),
        "pending": count_status(today_tasks, "Pending"),
        "working": count_status(today_tasks, "Working"),
        "sent_for_review": count_status(today_tasks, "Sent for Review"),
        "changes_required": count_status(today_tasks, "Changes Required"),
        "delayed": len(delayed),
    }

    designer_tasks = [t for t in today_tasks if t.get("task_type") == "Designer Task"]
    founder_tasks = [t for t in today_tasks if t.get("task_type") == "Founder Task"]

    designer_workload = {
        "total": len(designer_tasks),
        "done": count_status(designer_tasks, "Done"),
        "working": count_status(designer_tasks, "Working"),
        "pending": count_status(designer_tasks, "Pending"),
        "review": count_status(designer_tasks, "Sent for Review"),
    }
    founder_progress = {
        "total": len(founder_tasks),
        "done": count_status(founder_tasks, "Done"),
    }

    goals = [to_dict(g) for g in (await db.execute(select(Goal).where(Goal.status == "Active"))).scalars().all()]
    daily_goals = [g for g in goals if g.get("frequency") in ("Daily", "Alternate Day")]
    monthly_goals = [g for g in goals if g.get("goal_type") == "Monthly" or g.get("frequency") == "Monthly"]

    goals_completed, goals_pending = [], []
    daily_done = 0
    for g in daily_goals:
        task = (await db.execute(select(Task).where(
            Task.goal_id == g["id"], Task.date == sel_date))).scalars().first()
        done = bool(task and task.status == "Done")
        entry = {"id": g["id"], "goal_name": g["goal_name"], "category": g["category"],
                 "owner": g["owner"], "target_number": g.get("target_number"), "unit": g.get("unit", "")}
        if done:
            daily_done += 1
            goals_completed.append(entry)
        else:
            goals_pending.append(entry)

    month_done = 0
    month_total = 0
    for g in monthly_goals:
        cnt = (await db.execute(select(func.count()).select_from(Task).where(
            Task.goal_id == g["id"], Task.date.like(f"{sel_month}%"), Task.status == "Done"))).scalar() or 0
        total = (await db.execute(select(func.count()).select_from(Task).where(
            Task.goal_id == g["id"], Task.date.like(f"{sel_month}%")))).scalar() or 0
        month_done += cnt
        month_total += total
        entry = {"id": g["id"], "goal_name": g["goal_name"], "category": g["category"],
                 "owner": g["owner"], "target_number": g.get("target_number"), "unit": g.get("unit", "")}
        if cnt > 0 and cnt >= total and total > 0:
            goals_completed.append(entry)
        else:
            goals_pending.append(entry)

    needs_review = [t for t in today_tasks if t.get("status") in ("Sent for Review", "Changes Required")]

    status_distribution = [
        {"name": s, "value": count_status(today_tasks, s)}
        for s in ["Pending", "Working", "Sent for Review", "Changes Required", "Done", "Delayed"]
    ]
    last7 = []
    for i in range(6, -1, -1):
        d = (today - timedelta(days=i))
        ds = d.isoformat()
        day_tasks = (await db.execute(select(Task).where(Task.date == ds))).scalars().all()
        last7.append({
            "date": d.strftime("%a"),
            "completed": sum(1 for t in day_tasks if t.status == "Done"),
            "delayed": sum(1 for t in day_tasks if compute_delayed(t)),
        })

    return {
        "date": sel_date,
        "month": sel_month,
        "stats": stats,
        "designer_workload": designer_workload,
        "founder_progress": founder_progress,
        "daily_target_progress": {"done": daily_done, "total": len(daily_goals)},
        "monthly_goal_progress": {"done": month_done, "total": month_total},
        "goals_completed": goals_completed,
        "goals_pending": goals_pending,
        "delayed_tasks": delayed,
        "needs_review": needs_review,
        "charts": {"status_distribution": status_distribution, "last7": last7},
    }


@api_router.get("/")
async def root():
    return {"message": "The Social Chutney Co. Ops API"}


# ---------------------------------------------------------------------------
# Startup
# ---------------------------------------------------------------------------
async def seed_users():
    async with AsyncSessionLocal() as db:
        for email_key, pass_key, role, name in [
            ("ADMIN_EMAIL", "ADMIN_PASSWORD", "founder", "Founder"),
            ("DESIGNER_EMAIL", "DESIGNER_PASSWORD", "designer", "Designer"),
        ]:
            email = (os.environ.get(email_key) or "").strip().lower()
            password = os.environ.get(pass_key) or ""
            if not email or not password:
                continue
            existing = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
            if existing is None:
                db.add(User(email=email, password_hash=hash_password(password), name=name,
                            role=role, token_version=0))
            elif not verify_password(password, existing.password_hash):
                existing.password_hash = hash_password(password)
        await db.commit()


@app.on_event("startup")
async def startup():
    await seed_users()


app.include_router(api_router)

_cors_origins = [o.strip() for o in os.environ.get("FRONTEND_URL", "http://localhost:3000").split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
