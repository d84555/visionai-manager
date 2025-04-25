
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

class ModelInfo(BaseModel):
    id: str
    name: str
    path: str
    type: Optional[str] = None
    size: Optional[str] = None
    uploadedAt: str
    cameras: Optional[List[str]] = None
    localFilePath: Optional[str] = None

class ActiveModel(BaseModel):
    name: str
    path: str
