# backend/app/schemas/quote_schema.py
from pydantic import BaseModel, ConfigDict
from typing import Optional

class QuoteOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    request_id: int
    preis: float
    kommentar: Optional[str] = None
