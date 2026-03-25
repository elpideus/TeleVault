import logging


def setup_logging(level: str = "INFO") -> None:
    logging.basicConfig(
        level=getattr(logging, level.upper(), logging.INFO),
        format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
        datefmt="%Y-%m-%dT%H:%M:%S",
    )
    logging.getLogger().setLevel(getattr(logging, level.upper(), logging.INFO))

    # Silence Telethon's verbose internal logging — it's extremely chatty
    # at INFO/DEBUG level (MTProto internals, keepalives, connection events).
    logging.getLogger("telethon").setLevel(logging.WARNING)

    # Filter out high-frequency chunk upload requests from uvicorn access logs.
    class _ChunkUploadFilter(logging.Filter):
        def filter(self, record: logging.LogRecord) -> bool:
            msg = record.getMessage()
            return "/upload/chunk/" not in msg

    for logger_name in ("uvicorn.access", "uvicorn"):
        logging.getLogger(logger_name).addFilter(_ChunkUploadFilter())
