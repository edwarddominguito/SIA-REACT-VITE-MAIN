# SIA TES Property System (React + Vite)

This is a React+Vite conversion of your LocalStorage-based SIA TES Property UI.

## Folder structure
- `frontend/` React + Vite app
- `backend/` Express server (optional) to serve the built `frontend/dist`

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
