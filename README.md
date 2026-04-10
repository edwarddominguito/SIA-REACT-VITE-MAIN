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

## Google Sign-In setup (Direct Google Identity)
1. Copy env templates:
```bash
copy frontend\\.env.example frontend\\.env
copy backend\\.env.example backend\\.env
```
2. In `frontend/.env`, set:
- `VITE_GOOGLE_CLIENT_ID`
3. In `backend/.env`, set:
- `GOOGLE_CLIENT_ID`
4. In Google Cloud OAuth client:
  - Authorized JavaScript origin: `http://localhost:5173`
  - Add your deployed frontend origin too if you plan to use Vercel.
5. Keep the same Google client ID in both frontend and backend env files.

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

## Backend Serve With Fresh Frontend Build (Recommended for UI QA)
```bash
cd backend
npm install
npm run start:latest-ui
```

This command always rebuilds `frontend/dist` before starting Express so backend-served UI tests use the latest CSS/JS assets.

## UI Refactor QA Quick Checklist
- Build frontend only:
```bash
cd frontend
npm run build
```
- Build+serve through backend (recommended for final visual verification):
```bash
cd backend
npm run start:latest-ui
```
- Smoke routes:
  - `/`
  - `/properties/:id`
  - `/customer/book-appointment`
  - `/customer/dashboard`
  - `/agent`
  - `/admin`
  - `/admin/add-user`
  - Dashboard `messages` and `calendar` tabs
