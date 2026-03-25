"""Tests for parallel_upload_connections config field."""
import os
import sys
from unittest.mock import MagicMock

import pytest
from pydantic import ValidationError

sys.modules.setdefault("app.db.session", MagicMock())
os.environ.setdefault("TELEGRAM_API_ID", "12345")
os.environ.setdefault("TELEGRAM_API_HASH", "deadbeefdeadbeefdeadbeef00000000")
os.environ.setdefault("JWT_SECRET", "test-jwt-secret-for-unit-tests")
os.environ.setdefault("ENCRYPTION_KEY", "dGVzdC1lbmNyeXB0aW9uLWtleS0zMmJ5dGVzIS0tLS0=")
os.environ.setdefault("CORS_ORIGINS", "http://localhost:3000")
os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://u:p@localhost/db")

from app.core.config import Settings


def test_parallel_upload_connections_defaults_to_8():
    s = Settings()
    assert s.parallel_upload_connections == 8


def test_parallel_upload_connections_reads_from_env(monkeypatch):
    monkeypatch.setenv("PARALLEL_UPLOAD_CONNECTIONS", "4")
    s = Settings()
    assert s.parallel_upload_connections == 4


def test_parallel_upload_connections_rejects_zero():
    with pytest.raises(ValidationError):
        Settings(parallel_upload_connections=0)
