# The Social Chutney Co. — Ops API (Backend)

FastAPI backend for the Agency Operations App. Manages goals, auto-generated tasks, role-based access (Founder / Designer), and the review dashboard. Data is stored in **Supabase PostgreSQL** via SQLAlchemy (async) with Alembic migrations.

## Tech Stack
- FastAPI + Uvicorn
- SQLAlchemy 2 (async) + asyncpg (Supabase transaction pooler)
- Alembic (schema migrations)
- JWT (httpOnly cookies) + bcrypt

## Project Structure
```
backend/
├── server.py          # FastAPI app + all API routes (/api/...)
├── models.py          # SQLAlchemy ORM models (User, Goal, Task, ...)
├── database.py        # Async engine & session (Supabase)
├── alembic/           # Migrations
├── alembic.ini
├── requirements.txt
└── .env               # (not committed) — see .env.example
```

## Setup
```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env    # then fill in DATABASE_URL, JWT_SECRET, seed accounts
```

### Database (Supabase)
Use the **Transaction Pooler** connection string (port 6543). URL-encode special
characters in the password. Apply the schema:
```bash
alembic upgrade head
```

## Run
```bash
uvicorn server:app --host 0.0.0.0 --port 8001 --reload
```

## API (all prefixed with `/api`)
- `POST /auth/login` · `GET /auth/me` · `POST /auth/logout` · `POST /auth/refresh`
- `POST /auth/forgot-password` · `POST /auth/reset-password`
- `GET|POST /goals` · `PUT|DELETE /goals/{id}`
- `GET|POST /tasks` · `PUT|DELETE /tasks/{id}`
- `GET /dashboard`

## Roles
- **Founder**: full CRUD on goals & tasks, review notes.
- **Designer**: updates only execution fields (status, committed time, delay reason, output link).
