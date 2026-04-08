# Supabase Setup (Separated)

This folder is for Supabase-specific setup and migration files.

## Target project
- Project ref: `jtstkfpzrhjbqqkfmtvw`
- Dashboard: `https://supabase.com/dashboard/project/jtstkfpzrhjbqqkfmtvw`
- SQL Editor: `https://supabase.com/dashboard/project/jtstkfpzrhjbqqkfmtvw/editor`

## How this backend connects
The backend uses direct Postgres SQL through `DATABASE_URL`.

Set these in `backend/.env`:

```env
DB_CLIENT=postgres
DATABASE_URL=postgresql://postgres.<project-ref>:<db-password>@aws-<region>.pooler.supabase.com:6543/postgres?sslmode=require
DB_SSL=true
```

Get `DATABASE_URL` from:
- Supabase Dashboard
- `Project Settings -> Database -> Connection string -> Transaction pooler`

For this project (`jtstkfpzrhjbqqkfmtvw`), the host should be your project's
Supabase pooler endpoint and usually ends with `.pooler.supabase.com` on port `6543`.

## Migration strategy
- The backend auto-creates required tables/indexes on startup.
- Optional SQL snapshot is in `supabase/migrations/20260408_initial_schema.sql`
  if you want to initialize in SQL Editor first.

## Startup verification
1. In `backend/.env`, set `DB_CLIENT=postgres`, paste `DATABASE_URL`, and keep `DB_SSL=true`.
2. Start backend: `cd backend && npm start`.
3. Success check: console prints `Server running at http://localhost:3000`.
4. Failure check: startup stops with a clear phase (`config validation`, `db connect`, or `schema init`) and fix hint.

## Google Sign-In verification
1. In Supabase `Authentication -> Providers -> Google`:
- Enable the Google provider.
- Paste Google OAuth `Client ID` and `Client Secret`.
2. In Google Cloud OAuth client:
- Authorized JavaScript origin: `http://localhost:5173`
- Authorized redirect URI: `https://jtstkfpzrhjbqqkfmtvw.supabase.co/auth/v1/callback`
3. In Supabase `Authentication -> URL Configuration`:
- Add `http://localhost:5173/auth/callback` to Redirect URLs.
4. In local env files:
- `frontend/.env`: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- `backend/.env`: `SUPABASE_URL`, `SUPABASE_ANON_KEY`
5. Start apps:
- `cd backend && npm start`
- `cd frontend && npm run dev`
