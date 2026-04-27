# AgriScan Backend

FastAPI backend for AgriScan with JWT authentication, refresh tokens, TOTP MFA, recovery codes, role-based access control, audit logs, MySQL persistence, ML scan integration, weather hooks, and PDF reports.

## Local Run

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --reload
```

Use `AUTO_CREATE_TABLES=true` only for local development. For capstone or production demos, import `database/schema.sql` into MySQL first.

## ML Model

Place a TensorFlow SavedModel at `app/ml/artifacts/crop_disease_model` and install `requirements-ml.txt`. Without a model, the API uses a deterministic image heuristic fallback so the scan workflow remains demonstrable.
