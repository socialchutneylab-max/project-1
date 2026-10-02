# The Social Chutney Co. — Ops App (Frontend)

React frontend for the Agency Operations App. Role-based dashboard for Founder & Designer: Targets & Goals, Task Management, and the Review Dashboard.

## Tech Stack
- React 19 (CRA / CRACO)
- Tailwind CSS + shadcn/ui
- recharts, lucide-react, axios

## Project Structure
```
frontend/
├── src/
│   ├── App.js, index.js
│   ├── context/AuthContext.js
│   ├── components/ (Layout.js, ui/...)
│   ├── pages/ (Login, Dashboard, Goals, Tasks)
│   └── lib/ (api.js, constants.js)
├── package.json
└── .env            # (not committed) — see .env.example
```

## Setup
```bash
yarn install
cp .env.example .env     # set REACT_APP_BACKEND_URL to your backend URL
```

## Run
```bash
yarn start               # http://localhost:3000
```

## Build
```bash
yarn build
```

## Notes
- All API calls go to `REACT_APP_BACKEND_URL` and are sent with credentials (httpOnly cookies).
- The backend lives in a separate repository (see the Ops API repo).
