from dotenv import load_dotenv
from pathlib import Path
import os

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import logging
import secrets
import hashlib
from datetime import datetime, timezone, timedelta, date
from typing import Optional, Annotated, List

import bcrypt
import jwt
import httpx
from html import escape
from urllib.parse import urlparse

from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends, BackgroundTasks, Query
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, BeforeValidator, ConfigDict
from bson import ObjectId

# ---------------------------------------------------------------------------
# DB
# ---------------------------------------------------------------------------
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

app = FastAPI()
api_router = APIRouter(prefix="/api")

# ---------------------------------------------------------------------------
# Mongo helpers
# ---------------------------------------------------------------------------
PyObjectId = Annotated[str, BeforeValidator(str)]


def serialize(doc: dict) -> dict:
    if not doc:
        return doc
    doc = dict(doc)
    if "_id" in doc:
        doc["id"] = str(doc.pop("_id"))
    doc.pop("password_hash", None)
    return doc


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
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        if payload.get("ver", 0) != user.get("token_version", 0):
            raise HTTPException(status_code=401, detail="Session expired")
        return serialize(user)
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
async def is_locked_out(identifier: str) -> bool:
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=15)
    count = await db.login_attempts.count_documents(
        {"identifier": identifier, "created_at": {"$gt": cutoff.isoformat()}})
    return count >= 5


async def record_failed_attempt(identifier: str, email: str):
    await db.login_attempts.insert_one(
        {"identifier": identifier, "email": email, "created_at": datetime.now(timezone.utc).isoformat()})


async def clear_attempts(identifier: str, email: str):
    await db.login_attempts.delete_many({"$or": [{"identifier": identifier}, {"email": email}]})


# ---------------------------------------------------------------------------
# Password reset email
# ---------------------------------------------------------------------------
EMAIL_BASE_URL = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip().rstrip("/") or "https://integrations.emergentagent.com"
EMAIL_KEY = os.environ.get("EMERGENT_EMAIL_KEY", "")
EMAIL_FROM_NAME = os.environ.get("EMAIL_FROM_NAME") or "Your App"


async def send_password_reset_email(to_email: str, token: str) -> bool:
    base = os.environ.get("FRONTEND_URL", "").rstrip("/")
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
    goal_type: str = "Daily"            # Daily / Weekly / Monthly
    category: str = "Pitching"          # Pitching / Conversion / Social Media / IP / Personal Brand / Business / Learning / Finance
    goal_name: str
    target_number: float = 0
    unit: Optional[str] = ""
    owner: str = "Founder"              # Founder / Designer / Founder + Designer
    founder_responsibility: Optional[str] = ""
    designer_responsibility: Optional[str] = ""
    frequency: str = "Daily"           # Daily / Alternate Day / Weekly / Monthly / As Needed
    status: str = "Active"             # Active / Paused


class TaskIn(BaseModel):
    model_config = ConfigDict(extra="ignore")
    date: str
    task_type: str = "Founder Task"     # Founder Task / Designer Task
    work_category: str = "Internal Work"
    task_name: str
    assigned_to: str = ""
    brief: Optional[str] = ""
    priority: str = "Medium"            # High / Medium / Low
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
async def register(payload: RegisterIn, response: Response):
    email = payload.email.strip().lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already registered")
    role = payload.role if payload.role in ("founder", "designer") else "designer"
    doc = {"email": email, "password_hash": hash_password(payload.password),
           "name": payload.name or email.split("@")[0], "role": role,
           "token_version": 0, "created_at": datetime.now(timezone.utc).isoformat()}
    res = await db.users.insert_one(doc)
    uid = str(res.inserted_id)
    set_auth_cookies(response, create_access_token(uid, email, 0), create_refresh_token(uid, 0))
    doc["_id"] = res.inserted_id
    return serialize(doc)


@api_router.post("/auth/login")
async def login(payload: LoginIn, request: Request, response: Response):
    email = payload.email.strip().lower()
    ip = request.client.host if request.client else "unknown"
    identifier = f"{ip}:{email}"
    if await is_locked_out(identifier):
        raise HTTPException(status_code=429, detail="Too many failed attempts. Try again in 15 minutes.")
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(payload.password, user["password_hash"]):
        await record_failed_attempt(identifier, email)
        raise HTTPException(status_code=401, detail="Invalid email or password")
    await clear_attempts(identifier, email)
    uid = str(user["_id"])
    ver = user.get("token_version", 0)
    set_auth_cookies(response, create_access_token(uid, email, ver), create_refresh_token(uid, ver))
    return serialize(user)


@api_router.post("/auth/logout")
async def logout(response: Response, user: dict = Depends(get_current_user)):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return {"message": "Logged out"}


@api_router.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user


@api_router.post("/auth/refresh")
async def refresh(request: Request, response: Response):
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        if not user or payload.get("ver", 0) != user.get("token_version", 0):
            raise HTTPException(status_code=401, detail="Session expired")
        uid = str(user["_id"])
        ver = user.get("token_version", 0)
        set_auth_cookies(response, create_access_token(uid, user["email"], ver), create_refresh_token(uid, ver))
        return {"message": "refreshed"}
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


GENERIC_RESET = {"message": "If that email is registered, a reset link has been sent."}


@api_router.post("/auth/forgot-password")
async def forgot_password(payload: ForgotIn, background_tasks: BackgroundTasks):
    email = payload.email.strip().lower()
    now = datetime.now(timezone.utc)
    await db.password_reset_requests.insert_one({"email": email, "created_at": now.isoformat()})
    cutoff = now - timedelta(minutes=15)
    recent = await db.password_reset_requests.count_documents(
        {"email": email, "created_at": {"$gt": cutoff.isoformat()}})
    if recent > 5:
        return GENERIC_RESET
    user = await db.users.find_one({"email": email})
    if not user:
        return GENERIC_RESET
    raw = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(raw.encode()).hexdigest()
    await db.password_reset_tokens.insert_one({
        "token_hash": token_hash, "user_id": str(user["_id"]), "email": email,
        "expires_at": (now + timedelta(hours=1)).isoformat(), "used": False})
    background_tasks.add_task(send_password_reset_email, user["email"], raw)
    return GENERIC_RESET


@api_router.post("/auth/reset-password")
async def reset_password(payload: ResetIn):
    token_hash = hashlib.sha256(payload.token.encode()).hexdigest()
    now = datetime.now(timezone.utc).isoformat()
    doc = await db.password_reset_tokens.find_one_and_update(
        {"token_hash": token_hash, "used": False, "expires_at": {"$gt": now}},
        {"$set": {"used": True}})
    if not doc:
        raise HTTPException(status_code=400, detail="Invalid or expired reset link")
    email = doc["email"]
    await db.users.update_one({"_id": ObjectId(doc["user_id"])},
                              {"$set": {"password_hash": hash_password(payload.password)},
                               "$inc": {"token_version": 1}})
    await db.password_reset_tokens.delete_many({"user_id": doc["user_id"], "used": False})
    await db.login_attempts.delete_many({"email": email})
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


def should_generate(goal: dict, d: date) -> bool:
    freq = goal.get("frequency", "Daily")
    if freq == "Daily":
        return True
    if freq == "Alternate Day":
        return d.toordinal() % 2 == 0
    if freq == "Weekly":
        return d.weekday() == 0  # Monday
    if freq == "Monthly":
        return d.day == 1
    return False  # As Needed


def task_type_for_owner(owner: str) -> str:
    return "Founder Task" if "Founder" in owner else "Designer Task"


def compute_delayed(task: dict) -> bool:
    if task.get("status") in ("Done", "Sent for Review"):
        return False
    if task.get("status") == "Delayed":
        return True
    now = datetime.now()
    md = task.get("manager_deadline")
    if md:
        try:
            if datetime.strptime(md, "%Y-%m-%d").date() < now.date():
                return True
        except Exception:
            pass
    return False


def serialize_task(task: dict) -> dict:
    t = serialize(task)
    t["is_delayed"] = compute_delayed(task)
    return t


async def ensure_tasks_for_date(d: date):
    date_str = d.isoformat()
    goals = await db.goals.find({"status": "Active"}).to_list(1000)
    for goal in goals:
        if not should_generate(goal, d):
            continue
        gid = str(goal["_id"])
        exists = await db.tasks.find_one({"goal_id": gid, "date": date_str, "auto_generated": True})
        if exists:
            continue
        owner = goal.get("owner", "Founder")
        ttype = task_type_for_owner(owner)
        doc = {
            "date": date_str,
            "task_type": ttype,
            "work_category": CATEGORY_TO_WORK.get(goal.get("category", ""), "Internal Work"),
            "task_name": goal.get("goal_name", "Untitled"),
            "assigned_to": "Founder" if ttype == "Founder Task" else "Designer",
            "brief": goal.get("founder_responsibility", "") or goal.get("designer_responsibility", ""),
            "priority": "Medium",
            "manager_deadline": date_str,
            "committed_time": "",
            "status": "Pending",
            "delay_reason": "",
            "output_link": "",
            "review_notes": "",
            "target_number": goal.get("target_number"),
            "unit": goal.get("unit", ""),
            "goal_id": gid,
            "auto_generated": True,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.tasks.insert_one(doc)


# ---------------------------------------------------------------------------
# Goals endpoints
# ---------------------------------------------------------------------------
@api_router.get("/goals")
async def list_goals(user: dict = Depends(get_current_user)):
    goals = await db.goals.find().sort("created_at", 1).to_list(1000)
    return [serialize(g) for g in goals]


@api_router.post("/goals")
async def create_goal(payload: GoalIn, user: dict = Depends(require_founder)):
    doc = payload.model_dump()
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    res = await db.goals.insert_one(doc)
    doc["_id"] = res.inserted_id
    # generate today's task immediately if applicable
    await ensure_tasks_for_date(date.today())
    return serialize(doc)


@api_router.put("/goals/{goal_id}")
async def update_goal(goal_id: str, payload: GoalIn, user: dict = Depends(require_founder)):
    existing = await db.goals.find_one({"_id": ObjectId(goal_id)})
    if not existing:
        raise HTTPException(status_code=404, detail="Goal not found")
    data = payload.model_dump()
    await db.goals.update_one({"_id": ObjectId(goal_id)}, {"$set": data})
    # propagate target / name changes to linked, not-yet-done tasks
    task_updates = {}
    if data.get("target_number") != existing.get("target_number"):
        task_updates["target_number"] = data.get("target_number")
    if data.get("unit") != existing.get("unit"):
        task_updates["unit"] = data.get("unit")
    if data.get("goal_name") != existing.get("goal_name"):
        task_updates["task_name"] = data.get("goal_name")
    if task_updates:
        await db.tasks.update_many(
            {"goal_id": goal_id, "status": {"$ne": "Done"}},
            {"$set": task_updates})
    updated = await db.goals.find_one({"_id": ObjectId(goal_id)})
    return serialize(updated)


@api_router.delete("/goals/{goal_id}")
async def delete_goal(goal_id: str, user: dict = Depends(require_founder)):
    await db.goals.delete_one({"_id": ObjectId(goal_id)})
    # remove auto-generated, not-done tasks tied to this goal
    await db.tasks.delete_many({"goal_id": goal_id, "auto_generated": True, "status": {"$ne": "Done"}})
    return {"message": "Goal deleted"}


# ---------------------------------------------------------------------------
# Tasks endpoints
# ---------------------------------------------------------------------------
@api_router.get("/tasks")
async def list_tasks(
    user: dict = Depends(get_current_user),
    date: Optional[str] = Query(None),
    assigned_to: Optional[str] = Query(None),
    task_type: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    priority: Optional[str] = Query(None),
    work_category: Optional[str] = Query(None),
):
    # make sure today's auto tasks exist
    await ensure_tasks_for_date(datetime.now().date())
    q = {}
    if date:
        q["date"] = date
    if assigned_to:
        q["assigned_to"] = assigned_to
    if task_type:
        q["task_type"] = task_type
    if status:
        q["status"] = status
    if priority:
        q["priority"] = priority
    if work_category:
        q["work_category"] = work_category
    tasks = await db.tasks.find(q).sort("date", -1).to_list(2000)
    return [serialize_task(t) for t in tasks]


@api_router.post("/tasks")
async def create_task(payload: TaskIn, user: dict = Depends(get_current_user)):
    doc = payload.model_dump()
    # task type & assignment are determined by who creates it, not a free choice
    role = user.get("role")
    doc["task_type"] = "Founder Task" if role == "founder" else "Designer Task"
    doc["assigned_to"] = "Founder" if role == "founder" else "Designer"
    doc["auto_generated"] = False
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    res = await db.tasks.insert_one(doc)
    doc["_id"] = res.inserted_id
    return serialize_task(doc)


@api_router.put("/tasks/{task_id}")
async def update_task(task_id: str, payload: TaskUpdate, user: dict = Depends(get_current_user)):
    existing = await db.tasks.find_one({"_id": ObjectId(task_id)})
    if not existing:
        raise HTTPException(status_code=404, detail="Task not found")
    data = {k: v for k, v in payload.model_dump().items() if v is not None}
    # designers may only edit execution fields
    if user.get("role") != "founder":
        allowed = {"status", "committed_time", "delay_reason", "output_link"}
        data = {k: v for k, v in data.items() if k in allowed}
    if data:
        await db.tasks.update_one({"_id": ObjectId(task_id)}, {"$set": data})
    updated = await db.tasks.find_one({"_id": ObjectId(task_id)})
    return serialize_task(updated)


@api_router.delete("/tasks/{task_id}")
async def delete_task(task_id: str, user: dict = Depends(require_founder)):
    await db.tasks.delete_one({"_id": ObjectId(task_id)})
    return {"message": "Task deleted"}


# ---------------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------------
@api_router.get("/dashboard")
async def dashboard(user: dict = Depends(get_current_user),
                    date: Optional[str] = Query(None),
                    month: Optional[str] = Query(None)):
    today = datetime.now().date()
    sel_date = date or today.isoformat()
    sel_month = month or today.strftime("%Y-%m")

    await ensure_tasks_for_date(today)

    today_tasks = [serialize_task(t) for t in await db.tasks.find({"date": sel_date}).to_list(2000)]

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

    # goals
    goals = [serialize(g) for g in await db.goals.find({"status": "Active"}).to_list(1000)]
    daily_goals = [g for g in goals if g.get("frequency") in ("Daily", "Alternate Day")]
    monthly_goals = [g for g in goals if g.get("goal_type") == "Monthly" or g.get("frequency") == "Monthly"]

    goals_completed, goals_pending = [], []
    daily_done = 0
    for g in daily_goals:
        task = await db.tasks.find_one({"goal_id": g["id"], "date": sel_date})
        done = bool(task and task.get("status") == "Done")
        entry = {"id": g["id"], "goal_name": g["goal_name"], "category": g["category"],
                 "owner": g["owner"], "target_number": g.get("target_number"), "unit": g.get("unit", "")}
        if done:
            daily_done += 1
            goals_completed.append(entry)
        else:
            goals_pending.append(entry)

    # monthly goal progress: completed linked tasks this month vs target occurrences
    month_done = 0
    month_total = 0
    for g in monthly_goals:
        cnt = await db.tasks.count_documents(
            {"goal_id": g["id"], "date": {"$regex": f"^{sel_month}"}, "status": "Done"})
        total = await db.tasks.count_documents({"goal_id": g["id"], "date": {"$regex": f"^{sel_month}"}})
        month_done += cnt
        month_total += total
        if cnt > 0 and cnt >= total and total > 0:
            goals_completed.append({"id": g["id"], "goal_name": g["goal_name"], "category": g["category"],
                                    "owner": g["owner"], "target_number": g.get("target_number"),
                                    "unit": g.get("unit", "")})
        else:
            goals_pending.append({"id": g["id"], "goal_name": g["goal_name"], "category": g["category"],
                                  "owner": g["owner"], "target_number": g.get("target_number"),
                                  "unit": g.get("unit", "")})

    needs_review = [t for t in today_tasks if t.get("status") in ("Sent for Review", "Changes Required")]

    # charts
    status_distribution = [
        {"name": s, "value": count_status(today_tasks, s)}
        for s in ["Pending", "Working", "Sent for Review", "Changes Required", "Done", "Delayed"]
    ]
    last7 = []
    for i in range(6, -1, -1):
        d = (today - timedelta(days=i))
        ds = d.isoformat()
        day_tasks = await db.tasks.find({"date": ds}).to_list(2000)
        last7.append({
            "date": d.strftime("%a"),
            "completed": sum(1 for t in day_tasks if t.get("status") == "Done"),
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
    for email_key, pass_key, role, name in [
        ("ADMIN_EMAIL", "ADMIN_PASSWORD", "founder", "Founder"),
        ("DESIGNER_EMAIL", "DESIGNER_PASSWORD", "designer", "Designer"),
    ]:
        email = (os.environ.get(email_key) or "").strip().lower()
        password = os.environ.get(pass_key) or ""
        if not email or not password:
            continue
        existing = await db.users.find_one({"email": email})
        if existing is None:
            await db.users.insert_one({
                "email": email, "password_hash": hash_password(password), "name": name,
                "role": role, "token_version": 0, "created_at": datetime.now(timezone.utc).isoformat()})
        elif not verify_password(password, existing["password_hash"]):
            await db.users.update_one({"email": email}, {"$set": {"password_hash": hash_password(password)}})


@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.password_reset_tokens.create_index("expires_at", expireAfterSeconds=0)
    await db.password_reset_tokens.create_index("token_hash", unique=True)
    await db.login_attempts.create_index("email")
    await db.login_attempts.create_index("identifier")
    await db.password_reset_requests.create_index("email")
    await db.password_reset_requests.create_index("created_at", expireAfterSeconds=900)
    await db.tasks.create_index([("date", 1)])
    await db.tasks.create_index([("goal_id", 1)])
    await seed_users()


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.environ.get("FRONTEND_URL", "http://localhost:3000")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
