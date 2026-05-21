# AgriScan EC2 Deployment

This guide matches the current repository layout:

- Backend app: `~/Agriscan/backend`
- Frontend source: `~/Agriscan/frontend`
- Frontend bundle served by FastAPI: `~/Agriscan/backend/static/frontend`

## 1. Clone and install

```bash
cd ~
rm -rf ~/Agriscan
git clone https://github.com/RonaldMark17/Agriscan.git

cd ~/Agriscan/backend
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install --no-cache-dir -r requirements.txt

cd ~/Agriscan/frontend
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo bash -
sudo apt install -y nodejs
npm ci
npm run build:backend
```

`npm run build:backend` is the important step. It writes the frontend bundle to:

```text
~/Agriscan/backend/static/frontend
```

## 2. Create backend environment

Create `~/Agriscan/backend/.env` and put your backend settings there.

Do not create `~/backend/.env` by accident. From your home directory, `mkdir -p backend` creates a different folder outside the repo.

Minimum production-oriented values:

```env
ENVIRONMENT=production
FRONTEND_ORIGIN=https://your-domain.example
CORS_EXTRA_ORIGINS=https://your-domain.example
ALLOWED_HOSTS=your-domain.example,localhost,127.0.0.1
USE_SECURE_COOKIES=true
FORCE_HTTPS_REDIRECT=false
FRONTEND_DIST_DIR=static/frontend
FRONTEND_SOURCE_DIR=../frontend
VITE_API_BASE_URL=/api/v1
```

## 3. Install the systemd service

Copy the checked-in example and adjust the username if needed:

```bash
sudo cp ~/Agriscan/deploy/systemd/agriscan.service.example /etc/systemd/system/agriscan.service
sudo nano /etc/systemd/system/agriscan.service
```

Expected settings:

- `WorkingDirectory=/home/ubuntu/Agriscan/backend`
- `EnvironmentFile=/home/ubuntu/Agriscan/backend/.env`
- `ExecStart=/home/ubuntu/Agriscan/backend/venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000`

Then enable and start it:

```bash
sudo systemctl daemon-reload
sudo systemctl enable agriscan
sudo systemctl restart agriscan
sudo systemctl status agriscan
```

## 4. Verify the frontend bundle

If you see:

```json
{"detail":"Frontend index.html not found"}
```

check these paths first:

```bash
ls -lah ~/Agriscan/backend/static/frontend
test -f ~/Agriscan/backend/static/frontend/index.html && echo "INDEX OK" || echo "INDEX MISSING"
```

If `index.html` is missing, rebuild:

```bash
cd ~/Agriscan/frontend
npm ci
npm run build:backend
ls -lah ../backend/static/frontend/index.html
sudo systemctl restart agriscan
```

The backend now also falls back to `~/Agriscan/frontend/dist` if that build exists and the backend bundle is missing.

## 5. Safe update flow

When pulling updates, rebuild the frontend bundle after the pull:

```bash
cd ~/Agriscan
git pull origin main

cd ~/Agriscan/backend
source venv/bin/activate
pip install --no-cache-dir -r requirements.txt

cd ~/Agriscan/frontend
npm ci
npm run build:backend

sudo systemctl restart agriscan
```

Avoid running a separate manual `uvicorn --reload` process on the same EC2 host when systemd already manages the app.

## 6. Logs and troubleshooting

Show the active service definition:

```bash
sudo systemctl cat agriscan
```

Show recent service logs:

```bash
sudo journalctl -u agriscan -n 100 --no-pager
```

If the frontend still does not load, verify:

- `~/Agriscan/backend/static/frontend/index.html` exists
- the service points to `~/Agriscan/backend`
- `backend/.env` does not override `FRONTEND_DIST_DIR` to a bad path
- Node.js and npm are installed on the server
