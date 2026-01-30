"""
Tests for lifespan (scheduler startup/shutdown) and cleanup_expired_cache.
"""

from datetime import datetime, timezone, timedelta
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.database import Base, RepoExplanation
from backend.main import app, cleanup_expired_cache, scheduler


def test_lifespan_starts_scheduler_and_registers_cleanup_job():
    """Lifespan startup should add the cleanup job and start the scheduler."""
    with TestClient(app) as client:
        job = scheduler.get_job("cleanup_cache")
        assert job is not None, "cleanup_cache job should be registered"
        assert scheduler.running, "scheduler should be running"
    # After exiting, shutdown runs
    assert not scheduler.running, "scheduler should stop after lifespan shutdown"


def test_cleanup_expired_cache_deletes_expired_rows():
    """cleanup_expired_cache should delete rows where expires_at < now."""
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    TestSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    # Insert one expired row
    with TestSessionLocal() as session:
        session.add(
            RepoExplanation(
                owner="test",
                repo_name="repo",
                explanation="cached",
                expires_at=datetime.now(timezone.utc) - timedelta(days=1),
            )
        )
        session.commit()

    with patch("backend.main.SessionLocal", TestSessionLocal):
        cleanup_expired_cache()

    with TestSessionLocal() as session:
        remaining = session.query(RepoExplanation).count()
    assert remaining == 0, "Expired row should be deleted"
