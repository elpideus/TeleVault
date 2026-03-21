import logging
import os
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles

from app.api.auth import router as auth_router
from app.api.debug import router as debug_router
from app.api.channels import router as channels_router
from app.api.config import router as config_router
from app.api.dialogs import router as dialogs_router
from app.api.events import router as events_router
from app.api.files import router as files_router
from app.api.folders import router as folders_router
from app.api.icons import router as icons_router
from app.api.progress import router as progress_router
from app.api.search import router as search_router
from app.core.config import get_settings
from app.core.logging import setup_logging
from app.db.models.file import FILE_STATUS_FAILED, FILE_STATUS_PENDING, File
from app.db.session import AsyncSessionLocal
from app.telegram import client_pool
from sqlalchemy import delete, or_

logger = logging.getLogger(__name__)


async def _cleanup_stale_uploads() -> None:
    """Delete file records stuck in pending/failed state from a previous server run.

    pending  — server crashed mid-upload; Telegram messages (if any) are
               orphaned but no splits row exists, so there is nothing to
               re-delete from Telegram.
    failed   — upload failed and was already rolled back; only the File row
               was left as a tombstone.

    Both are safe to hard-delete here.  We only touch records older than
    60 seconds so we don't accidentally kill an in-flight upload that was
    started by another worker in the same pod during rolling restarts.
    """
    cutoff = datetime.utcnow() - timedelta(seconds=60)
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            delete(File).where(
                or_(File.status == FILE_STATUS_PENDING, File.status == FILE_STATUS_FAILED),
                File.created_at < cutoff,
            )
        )
        await session.commit()
        if result.rowcount:
            logger.warning(
                "Cleaned up %d stale upload record(s) (pending/failed) from a previous run",
                result.rowcount,
            )


@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_logging()
    async with AsyncSessionLocal() as session:
        await client_pool.initialize(session)
    await _cleanup_stale_uploads()
    logger.info("TeleVault API is ready")
    yield
    await client_pool.shutdown()
    logger.info("TeleVault API shutting down")


def create_app() -> FastAPI:
    application = FastAPI(title="TeleVault API", version="1.0.8", lifespan=lifespan)

    application.add_middleware(
        CORSMiddleware,
        allow_origins=get_settings().cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    application.include_router(auth_router)
    application.include_router(config_router)
    application.include_router(channels_router)
    application.include_router(dialogs_router)
    application.include_router(events_router)
    application.include_router(files_router)
    application.include_router(folders_router)
    application.include_router(icons_router)
    application.include_router(progress_router)
    application.include_router(search_router)

    static_dir = os.path.join(os.path.dirname(__file__), "..", "static")
    os.makedirs(static_dir, exist_ok=True)
    os.makedirs(get_settings().icons_dir, exist_ok=True)
    application.mount("/static", StaticFiles(directory=static_dir), name="static")

    if get_settings().debug_ui:
        application.include_router(debug_router)
        _playground_path = Path(__file__).parent / "static" / "playground.html"

        @application.get("/playground", include_in_schema=False)
        async def playground():
            port = get_settings().api_port
            content = _playground_path.read_text(encoding="utf-8").replace(
                'value="http://localhost:8000"',
                f'value="http://localhost:{port}"',
            )
            return HTMLResponse(content=content)

    return application


app = create_app()
