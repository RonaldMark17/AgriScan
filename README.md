# AgriScan: AI-Powered Smart Farming PWA

AgriScan is a full-stack Progressive Web App for smart agriculture monitoring and crop disease detection in the Philippines. It includes a React/Vite PWA frontend, FastAPI backend, SQLite offline persistence, JWT authentication, refresh tokens, authenticator-app MFA, audit logs, farm mapping data, AI scan workflow, marketplace listings, reports, Docker support, and integration hooks for weather, maps, email, SMS, OCR, and push notifications.

## Project Structure

```text
agriscan/
  backend/                 FastAPI API, auth, MFA, ML integration, reports
  frontend/                React + Vite + Tailwind PWA
  database/schema.sql      SQLite schema and role seed data
  docker-compose.yml       Backend + frontend with persisted SQLite data
```

## Quick Start With Docker

```bash
cp backend/.env.example backend/.env
docker compose up --build
```

Open:

- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:8000`
- API docs: `http://localhost:8000/docs`

Create the first admin after the backend is installed:

```bash
cd backend
copy .env.example .env
python -m pip install -r requirements.txt
python scripts/create_admin.py --name "AgriScan Admin" --email admin@agriscan.local --password "ChangeMe!2026Secure"
```

Admin accounts are forced through MFA setup on first login.

## Local Development

Backend:

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --reload
```

Frontend:

```bash
cd frontend
npm install
copy .env.example .env
npm run dev
```

To serve the built frontend from the backend instead of running Vite separately:

```bash
cd frontend
npm run build:backend
cd ../backend
uvicorn app.main:app --reload
```

Open `http://localhost:8000`; API routes remain under `/api/v1`.

Database:

SQLite is the default local/offline database and is stored at `backend/data/agriscan.sqlite3`.
Tables and role seed data are created automatically when `AUTO_CREATE_TABLES=true`.

To copy an existing MySQL database into SQLite once:

```bash
cd backend
python scripts/migrate_mysql_to_sqlite.py --replace
```

Set `MYSQL_DATABASE_URL` in `backend/.env` or pass `--source-url` if the old MySQL database is not on the default local connection.

## Security Highlights

- Argon2/bcrypt password hashing with strong password validation
- JWT access tokens plus rotating refresh tokens
- TOTP MFA with QR setup for Google Authenticator and Microsoft Authenticator
- One-time backup recovery codes
- Admin and inspector MFA policy
- Role-based access control for admin, farmer, inspector, and buyer workflows
- Login attempt limiter
- Forgot password via email OTP
- Device login history and new login alerts
- Audit logs for security-sensitive actions
- Security headers, CORS restrictions, ORM-backed SQL injection protection, upload validation

## PWA Features

- Installable manifest for mobile and desktop
- Service worker app shell caching and offline fallback page
- Auto-update prompt for new service worker versions
- Push notification subscription endpoint
- Responsive mobile-first dashboard UI
- Filipino and English language toggle

## ML Integration

The scan API accepts crop images and returns crop label, disease name, confidence, cause, and treatment recommendation. The trained TensorFlow classifier lives at:

```text
backend/app/ml/artifacts/crop_disease_model.keras
```

Then install:

```bash
pip install -r backend/requirements-ml.txt
```

Use Python 3.12 for ML dependencies. If no model is present, AgriScan uses a deterministic image-analysis fallback so the capstone demo remains functional.

## Production Notes

Set real secrets and API keys before deployment:

- `SECRET_KEY`
- `REFRESH_SECRET_KEY`
- `FERNET_KEY`
- `DATABASE_URL`
- `SMTP_*`
- `WEATHER_API_KEY`
- `GOOGLE_MAPS_API_KEY`

Use HTTPS, set `ENVIRONMENT=production`, configure `ALLOWED_HOSTS`, and run the frontend behind the included Nginx container or your platform edge.

For `agriscann.duckdns.org`, the backend should use:

```env
ENVIRONMENT=production
FRONTEND_ORIGIN=https://agriscann.duckdns.org
CORS_EXTRA_ORIGINS=https://agriscann.duckdns.org
ALLOWED_HOSTS=agriscann.duckdns.org,localhost,127.0.0.1
USE_SECURE_COOKIES=true
FORCE_HTTPS_REDIRECT=false
```

Build the frontend with a same-origin API URL so browser requests go through the HTTPS site:

```bash
docker compose --env-file backend/.env up -d --build
```

For production, set the same-origin frontend API URL before rebuilding:

```env
VITE_API_BASE_URL=/api/v1
```

Browser notifications are shown manually through the service worker while AgriScan is open or running in a background tab, so no notification keys are required.

## Notification Flow

AgriScan notifications are not true Web Push. They do not use browser push subscriptions, PushManager, pywebpush, webpush, or VAPID keys.

Current flow:

- Backend saves notifications in the database, then sends a realtime WebSocket signal from `backend/app/main.py`.
- Frontend listens with `connectRealtimeAlertStream` in `frontend/src/utils/realtimeAlerts.js`.
- `frontend/src/components/layout/Topbar.jsx` reloads notifications on realtime signals and every 60 seconds while the app is running.
- New unread items show an in-app toast plus a browser/local notification when permission is enabled.
- Browser/local notifications are displayed through `frontend/public/sw.js` using `self.registration.showNotification(...)`.

This means notifications work while AgriScan is open or in a background tab. True closed-browser delivery would require real Web Push, which is intentionally not enabled here.

Seed or refresh the production demo data without wiping the SQLite volume:

```bash
docker compose --env-file backend/.env --profile tools run --rm seed
```

If an Ubuntu host Nginx terminates TLS in front of Docker, use `deploy/nginx/agriscan.conf.example` as the site config. The important detail is that `/api/` proxies to `http://127.0.0.1:8000` without a trailing path, so FastAPI still receives `/api/v1/...`.
