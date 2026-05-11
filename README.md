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
- Admin MFA policy
- Role-based access control for admin and farmer workflows
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
- `FIREBASE_*`
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
VITE_ENABLE_REALTIME_ALERTS=false
```

Configure Firebase Cloud Messaging in `backend/.env` to enable closed-browser push delivery:

```env
FIREBASE_API_KEY=your-web-api-key
FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_STORAGE_BUCKET=your-project.appspot.com
FIREBASE_MESSAGING_SENDER_ID=1234567890
FIREBASE_APP_ID=1:1234567890:web:abcdef
FIREBASE_MEASUREMENT_ID=G-OPTIONAL
FIREBASE_VAPID_KEY=your-firebase-web-push-certificate-public-key
FIREBASE_SERVICE_ACCOUNT_FILE=/app/firebase-service-account.json
FIREBASE_STORAGE_PREFIX=agriscan
FIREBASE_MIRROR_UPLOADS=true
```

For Docker deployments, place the downloaded service account file at `backend/firebase-service-account.json` and mount it into the backend container:

```yaml
volumes:
  - ./backend/firebase-service-account.json:/app/firebase-service-account.json:ro
```

Firebase Storage also protects local SQLite data and scan uploads:

```bash
cd backend
source venv/bin/activate
python scripts/firebase_storage_sync.py backup-all
```

After a fresh clone or EC2 rebuild, restore uploads first, then restore SQLite while the app service is stopped:

```bash
sudo systemctl stop agriscan
cd ~/Agriscan/backend
source venv/bin/activate
python scripts/firebase_storage_sync.py restore-uploads
python scripts/firebase_storage_sync.py restore-db
sudo systemctl start agriscan
```

New scan image uploads are mirrored to Firebase Storage automatically when `FIREBASE_MIRROR_UPLOADS=true`. If a local
`/uploads/<file>` is missing, the backend will try to restore it from Firebase Storage before returning 404.

AJAX notification refresh runs every 10 seconds by default, so the notification bell updates without a manual refresh. Set `VITE_ENABLE_REALTIME_ALERTS=true` only after the host proxy can pass `/api/v1/notifications/stream` WebSocket traffic.

## Notification Flow

AgriScan supports Firebase Cloud Messaging for closed-browser delivery when Firebase is configured.

- Backend saves notifications in the database, then sends a realtime WebSocket signal from `backend/app/main.py`.
- Backend also sends Firebase push through stored browser FCM tokens in `backend/app/services/push_notifications.py`.
- Frontend subscribes with Firebase Messaging from the Security settings screen and stores the token through `/api/v1/notifications/push/subscribe`.
- `frontend/public/sw.js` handles native `push` events and displays notifications through `self.registration.showNotification(...)`.
- Frontend listens with `connectRealtimeAlertStream` in `frontend/src/utils/realtimeAlerts.js` only when realtime alerts are explicitly enabled.
- `frontend/src/components/layout/Topbar.jsx` reloads notifications on realtime signals and every 10 seconds while the app is running.
- New unread items show an in-app toast while AgriScan is open; Firebase push handles notifications when the app is closed or in the background.

Seed or refresh the production demo data without wiping the SQLite volume:

```bash
docker compose --env-file backend/.env --profile tools run --rm seed
```

If an Ubuntu host Nginx terminates TLS in front of Docker, use `deploy/nginx/agriscan.conf.example` as the site config. The important detail is that `/api/` proxies to `http://127.0.0.1:8000` without a trailing path, so FastAPI still receives `/api/v1/...`.

For disease photo uploads and realtime alerts, the host Nginx config must include `client_max_body_size 11m;` in the HTTPS `server` block and `/api/` location, plus the `/api/v1/notifications/stream` WebSocket proxy from `deploy/nginx/agriscan.conf.example`. Without the body-size setting, Nginx uses its 1 MB default and rejects photos before AgriScan can apply the 10 MB app limit. After editing the EC2 host config, run:

```bash
sudo nginx -t && sudo systemctl reload nginx
docker compose --env-file backend/.env up -d --build frontend backend
```
