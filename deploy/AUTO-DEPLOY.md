# Automatic production deployment

Every push to `main` runs `.github/workflows/deploy.yml`. Manual runs are also available in GitHub Actions. Other branches do not deploy.

The workflow validates backend dependencies and syntax, tests deployment rollback behavior, builds the frontend with its production API URL, and publishes packages as a prerelease tagged `deploy-<commit>`. These packages are public because the repository is public; environment files are excluded.

The deployment script updates only Hostinger Docker project `socialchutney-project1` on VPS `1083072`. It retains the environment already saved in Hostinger. The API credential is stored as the GitHub Actions secret `HOSTINGER_API_TOKEN`; it must be replaced there if revoked or expired.

Build errors leave the running deployment untouched. After an update, public HTTPS API and frontend checks must pass, and `/deploy-version.txt` must match the deployed commit. If they fail, the workflow restores the previous Compose configuration. A brief interruption can occur while Hostinger recreates the containers. This workflow does not run database migrations; changes requiring a migration need a separate reviewed migration plan.

Build/deployment status and logs: https://github.com/socialchutneylab-max/project-1/actions

The backend production dependency manifest is `backend/requirements-production.txt`. Keep it updated when adding backend dependencies. The frontend uses `npm ci` and the committed `frontend/package-lock.json`.
