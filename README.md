# AgriScan: AI-Powered Smart Farming PWA

AgriScan is a full-stack Progressive Web App for smart agriculture monitoring and crop disease detection in the Philippines. It includes a React/Vite PWA frontend, FastAPI backend, MySQL schema, JWT authentication, refresh tokens, authenticator-app MFA, audit logs, farm mapping data, AI scan workflow, marketplace listings, reports, Docker support, and integration hooks for weather, maps, email, SMS, OCR, and push notifications.

## Project Structure

```text
agriscan/
  backend/                 FastAPI API, auth, MFA, ML integration, reports
  frontend/                React + Vite + Tailwind PWA
  database/schema.sql      MySQL schema and role seed data
  docker-compose.yml       MySQL + backend + frontend
```

## Quick Start With Docker

```bash
docker compose up --build
```

Open:

- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:8000`
- API docs: `http://localhost:8000/docs`

Create the first admin after MySQL is running:

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

```bash
mysql -u root -p < database/schema.sql
```

## Security Highlights

- Argon2/bcrypt password hashing with strong password validation
- JWT access tokens plus rotating refresh tokens
- TOTP MFA with QR setup for Google Authenticator and Microsoft Authenticator
- One-time backup recovery codes
- Admin and inspector MFA policy
- Role-based access control for admin, farmer, inspector, and buyer workflows
- Login attempt limiter and CAPTCHA escalation
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
- `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`

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
VITE_API_BASE_URL=/api/v1 docker compose up -d --build
```

If an Ubuntu host Nginx terminates TLS in front of Docker, use `deploy/nginx/agriscan.conf.example` as the site config. The important detail is that `/api/` proxies to `http://127.0.0.1:8000` without a trailing path, so FastAPI still receives `/api/v1/...`.
