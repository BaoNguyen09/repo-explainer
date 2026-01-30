# repo-explainer

## Alembic migrations

Migrations live in `backend/alembic/`. Run from repo root (where `alembic.ini` lives):

- `alembic upgrade head` — apply all migrations
- `alembic downgrade -1` — roll back one revision
- `alembic revision --autogenerate -m "description"` — new migration from models
- `alembic current` — show current revision
- `alembic history -v` — show history

Set `DATABASE_URL` in `.env` before running. See [ENV_SETUP.md](ENV_SETUP.md).