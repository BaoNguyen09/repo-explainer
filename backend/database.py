"""
Database models and setup for repository explanation caching.
"""

from sqlalchemy import create_engine, Column, Integer, String, Text, DateTime, Index
from sqlalchemy.orm import declarative_base, sessionmaker, Session
from datetime import datetime, timezone
from typing import Generator
import hashlib

from backend import env

# SQLAlchemy base class for models
Base = declarative_base()


class RepoExplanation(Base):
    """Model for cached repository explanations."""
    
    __tablename__ = "repo_explanations"
    
    id = Column(Integer, primary_key=True, index=True)
    owner = Column(String(255), nullable=False, index=True)
    repo_name = Column(String(255), nullable=False, index=True)
    explanation = Column(Text, nullable=False)
    directory_hash = Column(String(64), nullable=True)  # SHA256 hash (64 chars)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    expires_at = Column(DateTime, nullable=False, index=True)
    
    # Composite index for faster lookups by owner/repo
    __table_args__ = (
        Index('idx_owner_repo', 'owner', 'repo_name'),
    )


# Database engine and session setup
# pool_pre_ping=True ensures connections are valid before use
engine = create_engine(
    env.DATABASE_URL,
    pool_pre_ping=True,  # Verify connections before using
    echo=False  # Set to True for SQL query logging (debugging)
)

# Session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db() -> Generator[Session, None, None]:
    """
    FastAPI dependency to get database session.
    
    Usage in FastAPI:
        @app.get("/endpoint")
        async def my_endpoint(db: Session = Depends(get_db)):
            # Use db here
            pass
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def compute_tree_hash(file_tree: str) -> str:
    """
    Generate SHA256 hash of file tree structure for cache invalidation.
    
    Args:
        file_tree: The formatted file tree string (directories only)
    
    Returns:
        SHA256 hash as hexadecimal string (64 characters)
    """
    return hashlib.sha256(file_tree.encode('utf-8')).hexdigest()


def init_db():
    """
    Initialize database tables.
    
    Note: In production, use Alembic migrations instead.
    This is useful for quick setup or testing.
    """
    Base.metadata.create_all(bind=engine)