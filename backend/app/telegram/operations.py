from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import TYPE_CHECKING, AsyncGenerator

from telethon.errors import FileReferenceExpiredError, MessageDeleteForbiddenError
from telethon.tl.types import DocumentAttributeFilename

if TYPE_CHECKING:
    from telethon import TelegramClient

logger = logging.getLogger(__name__)


@dataclass
class UploadedSplit:
    message_id: int
    file_id: str
    file_unique_id: str


@dataclass
class ForwardedSplit:
    new_message_id: int
    new_file_id: str
    new_file_unique_id: str


async def upload_document(
    client: "TelegramClient",
    channel_id: int,
    document: object,
    filename: str,
    size: int,
    progress_callback=None,
) -> UploadedSplit:
    msg = await client.send_file(
        channel_id,
        document,
        attributes=[DocumentAttributeFilename(file_name=filename)],
        force_document=True,
        file_size=size,
        progress_callback=progress_callback,
    )
    return UploadedSplit(
        message_id=msg.id,
        file_id=str(msg.document.id),
        file_unique_id=str(msg.document.access_hash),
    )


async def download_document(
    client: "TelegramClient",
    channel_id: int,
    message_id: int,
) -> AsyncGenerator[bytes, None]:
    msg = await client.get_messages(channel_id, ids=message_id)
    try:
        async for chunk in client.iter_download(msg.document, request_size=524288):
            yield chunk
    except FileReferenceExpiredError:
        await rederive_file_id(client, channel_id, message_id)
        msg = await client.get_messages(channel_id, ids=message_id)
        async for chunk in client.iter_download(msg.document, request_size=524288):
            yield chunk


async def delete_message(
    client: "TelegramClient",
    channel_id: int,
    message_id: int,
) -> None:
    try:
        await client.delete_messages(channel_id, [message_id])
    except MessageDeleteForbiddenError:
        pass


async def bulk_delete_messages(
    client: "TelegramClient",
    messages_by_channel: dict[int, list[int]],
) -> None:
    """Delete messages in bulk, grouped by channel. Batches at 100 per Telethon call."""
    for channel_id, message_ids in messages_by_channel.items():
        for i in range(0, len(message_ids), 100):
            batch = message_ids[i : i + 100]
            try:
                await client.delete_messages(channel_id, batch)
            except MessageDeleteForbiddenError:
                pass


async def forward_message(
    client: "TelegramClient",
    from_channel_id: int,
    to_channel_id: int,
    message_id: int,
) -> ForwardedSplit:
    # Note: Telethon argument order is (to, messages, from) — opposite of Pyrogram
    messages = await client.forward_messages(to_channel_id, [message_id], from_channel_id)
    msg = messages[0]
    if msg.document is None:
        raise ValueError("Forwarded message has no document")
    return ForwardedSplit(
        new_message_id=msg.id,
        new_file_id=str(msg.document.id),
        new_file_unique_id=str(msg.document.access_hash),
    )


async def rederive_file_id(
    client: "TelegramClient",
    channel_id: int,
    message_id: int,
) -> tuple[str, str]:
    msg = await client.get_messages(channel_id, ids=message_id)
    return str(msg.document.id), str(msg.document.access_hash)
