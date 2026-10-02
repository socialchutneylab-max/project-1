# PRD — The Social Chutney Co. | Agency Operations App

## Original Problem Statement
Simple internal Agency Operations App focused on execution, accountability, and daily clarity — reducing confusion between founder/manager and designer by making tasks, deadlines, responsibilities, targets, delays, and reviews visible. Three sections: Targets & Goals, Task Management, Review Dashboard.

## Architecture
- Frontend: React 19 (CRA/craco), Tailwind, shadcn/ui, recharts, lucide-react. Cabinet Grotesk + IBM Plex Sans. Brand = mint green (#10B981) + black, from supplied logo.
- Backend: FastAPI, SQLAlchemy (async + asyncpg) on **Supabase PostgreSQL** (transaction pooler). Schema managed via Alembic. All routes under /api. (Migrated from MongoDB/Motor on 2026-06; MONGO_URL retained in .env but unused.)
- Auth: cookie-based JWT (httpOnly access 15m + refresh 7d), bcrypt, brute-force lockout, full password-reset flow (Emergent email). Roles: founder, designer. Seeded 2 users.

## User Personas
- Founder/Manager (admin): creates/edits goals & tasks, sets review notes, deletes.
- Designer: updates committed time, status, delay reason, output link; cannot create/edit goals or add review notes.

## Core Requirements (static)
1. Targets & Goals: Goals Overview (by category) + editable master list/allocation.
2. Task Management: single filterable table (date/owner/status/priority/category) for founder + designer tasks.
3. Review Dashboard: daily & monthly stats, progress, delayed tasks, needs-review, goal completion.
4. Goals auto-generate linked tasks by frequency (Daily/Alternate Day/Weekly/Monthly/As Needed).
5. Editing a goal's target number syncs to linked not-done tasks.
6. Completing a goal-linked task updates goal progress & dashboard.

## Implemented (2026-06)
- JWT auth w/ roles + RBAC, password reset, seeded founder (socialchutneylab@gmail.com) + designer accounts.
- Goals CRUD with target/name/unit propagation to linked non-done tasks.
- Task CRUD, inline status updates, rich filters, overdue/delay detection, output links, review notes (founder-only).
- Auto task generation per goal frequency (lazy, on tasks/dashboard load for today).
- Review Dashboard: stat cards, daily/monthly progress, designer workload, founder progress, status pie, 7-day bar, goals completed/pending, delayed tasks, needs-review lists.
- Clean branded UI (sidebar nav, logo, Swiss high-contrast). Verified: 21/21 backend tests + frontend smoke passing.

## Database Migration (2026-06)
- Migrated primary datastore from MongoDB/Motor to the user's own **Supabase PostgreSQL** project (project ref fxywepzfhkdmdkhzdlqr, ap-south-1/Mumbai).
- Backend now uses SQLAlchemy async (asyncpg) over the Supabase **transaction pooler** (port 6543, `statement_cache_size=0`). `DATABASE_URL` in backend/.env (password URL-encoded).
- New files: `backend/models.py` (ORM models, String(36) UUID PKs), `backend/database.py` (async engine/session), `backend/alembic/` (migrations). Schema created via Alembic migration `32e312a97eed`.
- IDs are now UUID strings (no Mongo ObjectId). Both founder & designer accounts auto-seeded at startup. App runs on Supabase in BOTH preview and production (user-managed DB).
- Verified: 30/30 backend regression tests pass (iteration_10). No regressions.

## Backlog / Remaining
- P1: Weekly/monthly date range selector on dashboard (currently today + current month).
- P2: Per-date generation cache; CSV export; notifications/reminders; multi-designer support.
- P2: Explicit 403 (instead of silent drop) when designer attempts review notes.

## Next Tasks
- Await user feedback after first review; apply logo refinements if needed.
