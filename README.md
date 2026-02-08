# RepoExplainer
<img width="auto" height="400" alt="image" src="https://github.com/user-attachments/assets/c8d50046-c94c-41c4-a61c-d6b6b4c4656e" />


An AI app that explains GitHub repositories through agentic file exploration.

## Features
- **AI-powered summaries** -- Paste a GitHub repo URL and get an overview, architecture diagram, directory tree, and tech stack.
- **Ask what you need** -- Add instructions (e.g. "Focus on API design") and the explanation is tailored to your question.
- **Smart file discovery** -- The AI chooses which files to read from the repo tree; we fetch them in parallel for fast results.
- **Safe for large repos** -- Context limits and clear errors (e.g. "repository too large", "rate limit") instead of cryptic failures.
- **Polished UI** -- Dark/light theme, example repos and prompts, compact layout.

---

**Like this project?** [Star the repo](https://github.com/baonguyen09/repo-explainer) on GitHub -- it helps others find it. Want to improve it? Contributions are welcome! See [Contributing](#contributing) below.

---

## Installation

### Backend

**Prerequisites:** Python 3.11+

1. Clone the repo and go to its root.
2. Create and activate a virtual environment, then install the package.

**Using pip:**
```bash
python -m venv .venv
# Windows:
.venv\Scripts\activate
# Unix/macOS:
source .venv/bin/activate
pip install -e .
```

**Using uv:**
```bash
uv venv
# Windows:
.venv\Scripts\activate
# Unix/macOS:
source .venv/bin/activate
uv pip install -e .
```

3. Copy env: create a `.env` at the project root (or in `backend/`) and set variables. See [backend/.env.example](backend/.env.example) and [ENV_SETUP.md](ENV_SETUP.md) for `DATABASE_URL`, `ANTHROPIC_API_KEY`, `GITHUB_TOKEN`, `CORS_ORIGINS`, etc.

### Frontend

**Prerequisites:** Node.js 18+ (npm or bun)

1. From repo root, go to the frontend and install dependencies:

```bash
cd frontend
# npm:
npm install
# or bun:
bun install
```

2. Set the backend URL for development: create `frontend/.env.development` with:
   ```bash
   VITE_BACKEND_API_URL=http://127.0.0.1:8000
   ```
   See [ENV_SETUP.md](ENV_SETUP.md#frontend-environment-variables) for production and other options.

## Development

### Backend

- **Dev dependencies (optional):** `pip install -e '.[dev]'` or `uv pip install -e '.[dev]'` (pytest, black, ruff, mypy, etc.).
- **Run API:** From repo root: `fastapi dev backend/main.py` (serves at http://127.0.0.1:8000).
- **Run tests:** `pytest backend/tests/` (or `pytest backend/tests/ -v`).
- **Lint / format:** `ruff check .` and `black .` (config in [pyproject.toml](pyproject.toml)).
- **Local Postgres:** `docker compose up -d`, then set `DATABASE_URL` in `.env`. See [ENV_SETUP.md](ENV_SETUP.md#local-postgresql-with-docker).

### Frontend

- **Run dev server:** From `frontend/`: `npm run dev` or `bun run dev` (Vite, usually http://localhost:5173).
- **Build:** `npm run build` or `bun run build`.
- **Lint:** `npm run lint` or `bun run lint`.
- **Preview production build:** `npm run preview` or `bun run preview`.

Run the backend API first so the frontend can talk to it; use the same `VITE_BACKEND_API_URL` as in `frontend/.env.development`.

## One-command local dev (Docker)

Run backend, frontend, and Postgres with a single command (from repo root):

```bash
# Create .env at repo root (same folder as docker-compose.yml) with ANTHROPIC_API_KEY=... and optionally GITHUB_TOKEN.
# Copy from backend/.env.example, then add your keys. Docker Compose needs this file to exist.
docker compose up --build
```

Then open **http://localhost:5173** (frontend) and **http://localhost:8000** (API docs). The backend runs migrations on startup. To run in the background: `docker compose up -d`.

## Docker (backend only, for deployment)

The backend can run in a container for deployment on any cloud (Render, Fly.io, Cloud Run, ECS, etc.).

**Build** (from repo root):
```bash
docker build -t repo-explainer .
```

**Run locally:**
```bash
docker run -p 8000:8000 \
  -e DATABASE_URL="postgresql+psycopg2://user:pass@host:5432/db" \
  -e ANTHROPIC_API_KEY="your-key" \
  -e CORS_ORIGINS="http://localhost:5173" \
  repo-explainer
```

- The image uses `PORT` (default 8000); set `-e PORT=8000` or let your platform set it.
- Run migrations before or after start (e.g. a separate job or init container): `alembic upgrade head` with the same `DATABASE_URL`.
- See [backend/.env.example](backend/.env.example) and [ENV_SETUP.md](ENV_SETUP.md) for all env vars.

## Alembic migrations

Migrations live in `backend/alembic/`. Run from repo root (where `alembic.ini` lives):

- `alembic upgrade head` -- apply all migrations
- `alembic downgrade -1` -- roll back one revision
- `alembic revision --autogenerate -m "description"` -- new migration from models
- `alembic current` -- show current revision
- `alembic history -v` -- show history

Set `DATABASE_URL` in `.env` before running. See [ENV_SETUP.md](ENV_SETUP.md).

## Contributing

We welcome contributions -- whether it’s a bug fix, a new feature, or better docs. Here’s how to get started.

### How to contribute

1. **Star the repo** -- If you find this useful, starring helps others discover it.
2. **Open an issue** -- Report bugs or suggest ideas in [GitHub Issues](https://github.com/baonguyen09/repo-explainer/issues). Check existing issues first to avoid duplicates.
3. **Submit a pull request** -- For code or doc changes:
   - Fork the repo and create a branch from `main` (e.g. `fix/typo-readme` or `feat/your-feature`).
   - Make your changes. Keep commits focused and messages clear.
   - Run tests and linting (see [Development](#development)).
   - Open a PR against `main` with a short description of what changed and why. Link any related issue.

### Guidelines

- **Code style:** Backend -- follow [ruff](https://docs.astral.sh/ruff/) and [Black](https://black.readthedocs.io/) (config in `pyproject.toml`). Frontend -- use the existing ESLint config.
- **Tests:** Add or update tests for behavior changes; run `pytest backend/tests/` before submitting.
- **Docs:** Update the README or ENV_SETUP.md if you change setup, env vars, or usage.
- **Scope:** Keep PRs reasonably scoped; for large features, open an issue first to discuss.

Thank you for contributing!
