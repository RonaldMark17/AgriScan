# AgriScan Backend

FastAPI backend for AgriScan with JWT authentication, refresh tokens, TOTP MFA, recovery codes, role-based access control, audit logs, SQLite offline persistence, ML scan integration, weather hooks, and PDF reports.

## Local Run

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --reload
```

SQLite is the default database and is created at `data/agriscan.sqlite3` when `AUTO_CREATE_TABLES=true`.
To copy an existing MySQL database into SQLite, set `MYSQL_DATABASE_URL` in `.env` and run:

```bash
python scripts/migrate_mysql_to_sqlite.py --replace
```

## Serve the Frontend From FastAPI

Build the Vite app into the backend static folder:

```bash
cd ../frontend
npm install
npm run build:backend
cd ../backend
uvicorn app.main:app --reload
```

Then open `http://localhost:8000`. FastAPI will serve the React app and keep the API under `/api/v1`.

## ML Model

The TensorFlow crop+disease classifier is loaded from `app/ml/artifacts/crop_disease_model.keras` with labels from `app/ml/artifacts/labels.json`. Install `requirements-ml.txt` with Python 3.12 for local ML inference. Without a model, the API uses a deterministic image heuristic fallback so the scan workflow remains demonstrable.
