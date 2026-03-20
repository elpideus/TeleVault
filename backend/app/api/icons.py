import io
import os

from fastapi import APIRouter, Depends, HTTPException, Response, UploadFile
from PIL import Image
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.core.deps import get_current_user, get_db
from app.db.models.user import User
from app.schemas.folders import FolderOut
from app.services import folders as svc

router = APIRouter(prefix="/api/v1/icons", tags=["icons"])


@router.post("/{slug:path}", response_model=FolderOut)
async def upload_folder_icon(
    slug: str,
    file: UploadFile,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    image_bytes = await file.read()
    return await svc.upload_folder_icon(
        session,
        current_user.telegram_id,
        slug,
        image_bytes,
        file.content_type or "",
        settings,
    )


@router.get("/{slug:path}")
async def get_folder_icon(
    slug: str,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    folder = await svc.get_folder_by_slug(session, current_user.telegram_id, slug)
    if not folder.icon_image:
        raise HTTPException(status_code=404, detail="No icon set for this folder")
    icon_path = os.path.join(settings.icons_dir, f"{folder.id}.webp")
    if not os.path.isfile(icon_path):
        raise HTTPException(status_code=404, detail="Icon file not found on disk")
    with open(icon_path, "rb") as f:
        data = f.read()
    image = Image.open(io.BytesIO(data))
    width, height = image.size
    return Response(
        content=data,
        media_type="image/webp",
        headers={
            "X-Image-Width": str(width),
            "X-Image-Height": str(height),
            "X-File-Size": str(len(data)),
            "Cache-Control": "private, max-age=3600",
        },
    )
