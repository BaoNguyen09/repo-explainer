# Backend API only. Build from repo root: docker build -t repo-explainer .
# Run: docker run -p 8000:8000 -e DATABASE_URL=... -e ANTHROPIC_API_KEY=... repo-explainer

FROM python:3.12-slim

WORKDIR /app

# Reproducible install from lock file (run `uv lock` if you change deps)
COPY pyproject.toml uv.lock ./
COPY backend ./backend
COPY alembic.ini ./

RUN pip install --no-cache-dir uv && uv sync --frozen --no-dev
ENV PATH="/app/.venv/bin:$PATH"

EXPOSE 8000
ENV PORT=8000

# PORT is set by many cloud providers (Render, Fly, Cloud Run, etc.)
CMD ["sh", "-c", "exec fastapi run backend/main.py --host 0.0.0.0 --port ${PORT:-8000}"]
