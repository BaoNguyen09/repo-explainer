"""
Pytest configuration. Sets DATABASE_URL for tests so backend.database can load.
"""
import os

# Use in-memory SQLite when DATABASE_URL is not set (e.g. CI, fresh clone).
# Lets tests that import backend.main/backend.database run without a real DB.
os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
