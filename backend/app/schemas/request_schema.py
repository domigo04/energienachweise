# backend/app/schemas/request_schema.py
from pydantic import BaseModel, ConfigDict
from typing import Literal

RequestStatus = Literal["requested", "responded", "accepted", "rejected", "expired"]

class RequestOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int
    experte_id: int
    status: RequestStatus
