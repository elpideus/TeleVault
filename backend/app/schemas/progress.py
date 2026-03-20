from pydantic import BaseModel


class ProgressOut(BaseModel):
    operation_id: str
    pct: float
    bytes_done: int
    bytes_total: int
    status: str
    message: str | None = None
    error: str | None = None
