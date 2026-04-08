# SIA TES Property System (React + Vite)

This is a React+Vite conversion of your LocalStorage-based SIA TES Property UI.

## Folder structure
- `frontend/` React + Vite app
- `backend/` Express server (optional) to serve the built `frontend/dist`
- `docs/refactor-baseline.md` route matrix and parity checklist for safe refactors

## Architecture (refactor baseline)

### Backend
- `backend/src/server.js` single runtime entrypoint and API surface
- `backend/src/app` startup lifecycle helpers (`start-server`, `graceful-shutdown`)
- `backend/src/config` environment config
- `backend/src/db` database pool runtime
- `backend/src/middleware` request metadata middleware
- `backend/src/modules/*/*.routes|*.controller|*.service|*.model` feature modules
- `backend/src/shared/http` shared async route wrapper

### Frontend
- `frontend/src/main.jsx` app entrypoint
- `frontend/src/app` providers and route composition
- `frontend/src/context` auth/app context providers
- `frontend/src/config` runtime config and route config
- `frontend/src/pages` route-level screens grouped by domain
- `frontend/src/components`, `layout`, `ui` reusable UI layers
- `frontend/src/api`, `services`, `hooks`, `utils`, `data` app logic and helpers
- `frontend/src/styles` global style files (`tokens`, `base`)

## Run in DEV
```bash
cd frontend
npm install
npm run dev
```

### Demo accounts
- admin / admin123
- agent / agent123
- customer / customer123

## Build + serve with backend
```bash
cd frontend
npm install
npm run build

cd ../backend
npm install
npm start
```

Open http://localhost:3000
