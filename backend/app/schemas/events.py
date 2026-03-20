import uuid
from datetime import datetime

from typing import Any
from pydantic import BaseModel, ConfigDict, Field, model_validator


class EventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: uuid.UUID
    actor_telegram_id: int
    action: str
    target_type: str | None
    target_id: str | None
    target_name: str | None = None
    metadata: dict | None = Field(None, alias="metadata_")
    created_at: datetime

    @model_validator(mode="before")
    @classmethod
    def map_metadata(cls, data: Any) -> Any:
        if isinstance(data, dict):
            # For dictionary input
            if "metadata_" in data and ("metadata" not in data or data["metadata"] is None):
                data["metadata"] = data.pop("metadata_")
        else:
            # For object input (e.g. SQLAlchemy model instance)
            # SQLAlchemy models have a 'metadata' attribute (MetaData object) 
            # that conflicts with our field name. We MUST use 'metadata_'.
            m = getattr(data, "metadata_", None)
            if m is not None:
                # If we are here, we are validating FROM an object.
                # We can't easily modify the object, so we convert to a dict
                # OR we rely on the fact that Pydantic will now see 'metadata'
                # in the dict we return.
                if hasattr(data, "__dict__"):
                    d = dict(data.__dict__)
                    d["metadata"] = m
                    return d
        return data


class EventListOut(BaseModel):
    items: list[EventOut]
    total: int
    page: int
    page_size: int
