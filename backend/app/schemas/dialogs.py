from pydantic import BaseModel


class DialogOut(BaseModel):
    channel_id: int
    title: str
    username: str | None
    type: str
    is_creator: bool
