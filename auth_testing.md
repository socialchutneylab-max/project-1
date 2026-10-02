# Auth Testing Playbook — The Social Chutney Co.

Credentials seeded on startup (see /app/memory/test_credentials.md):
- Founder: socialchutneylab@gmail.com / Chutney@2026 (role: founder)
- Designer: designer@socialchutneyco.com / Design@2026 (role: designer)

## API Testing
```
curl -c cookies.txt -X POST http://localhost:8001/api/auth/login -H "Content-Type: application/json" -d '{"email":"socialchutneylab@gmail.com","password":"Chutney@2026"}'
curl -b cookies.txt http://localhost:8001/api/auth/me
```
Login returns the user object and sets access_token + refresh_token httpOnly cookies.

## Password reset (local)
Set FRONTEND_URL="http://localhost:3000" in backend/.env and restart backend so the reset link is logged. Restore the real https origin afterwards.

## Notes
- Founder can create/edit/delete goals & tasks and set review notes.
- Designer can update task status, committed time, delay reason, output link.
- Goals with frequency Daily/Alternate Day/Weekly/Monthly auto-generate linked tasks.
