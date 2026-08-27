# CloudDev — A Docker-Based Cloud IDE

CloudDev is a browser-based development environment. Sign up, create a project in Python, Java, or C++, and get your own isolated Docker container — complete with a real code editor, a real terminal, and persistent file storage — accessible from any browser.

## Tech Stack

- **Frontend:** HTML, CSS, JavaScript (vanilla) — Monaco Editor, Xterm.js
- **Backend:** Python (Flask) + Flask-SocketIO
- **Database:** MongoDB
- **Containerization:** Docker + docker-py
- **Auth:** JWT + bcrypt

## Project Status

| Phase | What it covers | Status |
|---|---|---|
| 1 — Planning & Design | Architecture, DB schema, tech stack | ✅ Done |
| 2 — Backend & Auth | REST API, JWT auth, project CRUD | ✅ Done |
| 3 — Container Orchestration | Full container lifecycle, per-language images, resource limits | ✅ Done |
| 4 — Frontend & Real-Time Editor | Monaco editor, file explorer, live Xterm.js terminal | ✅ Done |
| **5 — Integration & Testing** | End-to-end testing, security hardening, bug fixes | ✅ **Done** |
| 6 — Deployment | Public hosting, domain, HTTPS | ⬜ Not started |

## What's actually working right now

- Sign up / log in (JWT-based, bcrypt-hashed passwords)
- Create a project in **Python, Java, or C++**
- Each project gets its own real, isolated Docker container — not shared infrastructure
- Configure CPU / memory (max 512MB) / storage (max 512MB) per container via a guided stepper
- Full container lifecycle: **Create → Start → Stop → Restart → Destroy**
- Live resource monitoring (real CPU%/memory usage, polled from Docker)
- Real logs viewer (search, copy, download)
- A real in-browser IDE per project:
  - File explorer (create, rename, delete, refresh)
  - Monaco code editor (syntax highlighting, Ctrl+S to save)
  - Live terminal (Xterm.js ↔ Socket.IO ↔ the actual container's shell)
- Files, terminal, and editor all operate on the exact same workspace — no duplicate filesystems
- Container state automatically reconciles with real Docker state (won't show "running" if it's actually dead)
- Cross-user isolation enforced at every layer — verified via direct testing, not just assumed

## What's intentionally not built yet

- **AI Assistant** — UI shell exists (slide-over panel), not connected to a real AI backend
- **Deployments, Monitoring (historical charts), Templates, Marketplace, Extensions** — sidebar panels exist with honest "coming in a later phase" messaging, no fake data
- **Public deployment** — everything currently runs on `localhost` only; see Phase 6

## Prerequisites

- **Docker Desktop** (with WSL2 backend on Windows)
- **Python 3.10+**
- **MongoDB** (runs via Docker Compose — no separate install needed)
- A code editor (VS Code recommended) with the **Live Server** extension

## Setup — from a fresh clone

### 1. Clone and enter the project
```powershell
git clone <your-repo-url>
cd clouddev
```

### 2. Start MongoDB
```powershell
docker compose up -d
```

### 3. Build the three language images (one-time)
```powershell
docker build -t clouddev/python:3.12 -f backend/docker/Dockerfile.python backend/docker
docker build -t clouddev/java:17 -f backend/docker/Dockerfile.java backend/docker
docker build -t clouddev/cpp:latest -f backend/docker/Dockerfile.cpp backend/docker
```

### 4. Set up the backend
```powershell
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
```
Open `.env` and set a real `JWT_SECRET` (any long random string).

### 5. Run the backend
```powershell
python app.py
```
Confirm it's healthy: open `http://localhost:5000/api/health` — should show `{"status": "healthy", "database": "healthy", "docker": "healthy"}`.

### 6. Run the frontend
Right-click `frontend/codedock/login.html` in VS Code → **Open with Live Server**.

## Running the automated tests

```powershell
cd backend
venv\Scripts\activate
python -m pytest tests/test_security.py -v
```
Covers path traversal prevention, resource-limit clamping, and JWT auth — the highest-risk logic in the app. Requires Docker Desktop running (since `files.py` imports the Docker client at module load).

## Project Structure

clouddev/
├── backend/
│ ├── app.py # Entry point, Socket.IO handlers, health check
│ ├── docker/ # Dockerfiles for Python/Java/C++ workspace images
│ ├── models/ # MongoDB connection
│ ├── routes/ # auth, projects, containers, files
│ ├── services/ # docker_manager.py, terminal_manager.py
│ ├── tests/ # pytest security suite
│ └── utils/ # JWT + auth decorator
├── frontend/
│ ├── codedock/ # Login / register / admin-login pages
│ ├── css/ # dashboard.css, containers.css
│ ├── js/ # api.js, dashboard.js, workspace.js
│ └── pages/ # dashboard.html, workspace.html, signup.html
└── docker-compose.yml # MongoDB


## Known Limitations (documented, not hidden)

- **True multi-user load testing (5-10+ concurrent)** wasn't independently verified — needs multiple real client machines to test meaningfully. Two concurrent real sessions were tested and confirmed fully isolated.
- **Storage limit enforcement (512MB)** is applied best-effort via Docker's `storage_opt`, which requires a storage driver most default Docker Desktop installs don't have enabled. Memory limit enforcement (512MB) was stress-tested and confirmed working.
- **No formal rate limiting** yet — reasonable for current development-stage testing; worth adding before any public deployment.
- Everything currently runs on `localhost` only — not reachable from other machines until Phase 6 (Deployment).

## Team Workflow

Branch strategy: `main` (stable) + `dev` (active work), matching the roadmap. Do new work on `dev` or a `feature/...` branch off it; only merge into `main` once tested.

## Next Up: Phase 6 — Deployment

Deploy to a cloud VM, point a domain at it, add HTTPS via Let's Encrypt, and set up continuous deployment so merges into `main` automatically go live.