from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.event import Event


async def log_event(
    session: AsyncSession,
    actor_telegram_id: int,
    action: str,
    target_type: str | None = None,
    target_id: str | None = None,
    metadata: dict | None = None,
) -> None:
    event_obj = Event(
        actor_telegram_id=actor_telegram_id,
        action=action,
        target_type=target_type,
        target_id=target_id,
        metadata_=metadata,
    )
    session.add(event_obj)

    # Notify SSE streams after commit. Store notify IDs on the *sync* session's
    # info dict because that's the object received by the after_commit handler.
    from app.telegram import event_broadcaster
    sync_sess = session.sync_session
    sync_sess.info.setdefault("_notify_ids", set()).add(actor_telegram_id)

    if "_activity_hook_registered" not in sync_sess.info:
        sync_sess.info["_activity_hook_registered"] = True

        @event.listens_for(sync_sess, "after_commit")
        def _after_commit(s):  # type: ignore[misc]
            for uid in s.info.get("_notify_ids", set()):
                event_broadcaster.notify(uid)
            s.info.pop("_notify_ids", None)
            s.info.pop("_activity_hook_registered", None)
