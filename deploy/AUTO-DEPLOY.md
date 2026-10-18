# Automatic production deployment

Every push to `main` runs `.github/workflows/deploy.yml`. Manual runs are also available in GitHub Actions. Other branches do not deploy.

The workflow validates backend dependencies and syntax, tests deployment rollback behavior, builds the frontend with its production API URL, and publishes packages as a prerelease tagged `deploy-<commit>`. These packages are public because the repository is public; environment files are excluded.

The deployment script updates only Hostinger Docker project `socialchutney-project1` on **VPS 2 (`2071790`, IP `200.141.13.72`)**. It retains the environment already saved for that project on VPS 2. The API credential is stored as the GitHub Actions secret `HOSTINGER_API_TOKEN`; it must have access to VPS 2 and must be replaced there if revoked or expired.

Build errors leave the running deployment untouched. After an update, HTTPS API and frontend checks connect directly to `200.141.13.72`, preserving the domain names and certificate verification. This checks VPS 2 even while public DNS is still cached at the old IP. `/deploy-version.txt` must match the deployed commit. If health or version checks fail, the workflow restores the previous Compose configuration and saved environment on VPS 2. A brief interruption can occur while Hostinger recreates the containers. This workflow does not run database migrations; changes requiring a migration need a separate reviewed migration plan.

If a Hostinger write response is lost, the workflow stops without resending the write or queuing a competing rollback. Inspect the VPS 2 action status before retrying that run.

The existing Supabase connection must work for backend startup and deployment health checks to pass. An unavailable database still causes deployment verification to fail; this workflow does not replace or reset the database.

Container logs remain capped at three 10 MB files per service. Backend failures are limited to five restart attempts to prevent an unavailable database from causing an endless download/install/crash loop.

Build/deployment status and logs: https://github.com/socialchutneylab-max/project-1/actions

The backend production dependency manifest is `backend/requirements-production.txt`. Keep it updated when adding backend dependencies. The frontend uses `npm ci` and the committed `frontend/package-lock.json`.
