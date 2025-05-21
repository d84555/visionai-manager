
from datetime import datetime
from typing import Optional, Dict, Any, List
from pydantic import BaseModel, Field

# Settings model
class Setting(BaseModel):
    id: Optional[int] = None
    section: str
    key: str
    value: Dict[str, Any]
    updated_at: Optional[datetime] = None

# Event log model
class EventLog(BaseModel):
    id: Optional[str] = None
    type: str
    category: str
    message: str
    details: Optional[Dict[str, Any]] = Field(default_factory=dict)
    severity: str
    created_at: Optional[datetime] = None
    acknowledged: bool = False
    acknowledged_at: Optional[datetime] = None
    acknowledged_by: Optional[str] = None

# Database configuration model
class DatabaseConfig(BaseModel):
    host: str = "localhost"
    port: int = 5432
    database: str = "avianet"
    user: str = "postgres"
    password: str = "postgres"
    ssl: bool = False

# Event filtering options
class EventFilterOptions(BaseModel):
    type: Optional[str] = None
    category: Optional[str] = None
    severity: Optional[str] = None
    acknowledged: Optional[bool] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    limit: int = 100
    offset: int = 0

# Response models
class SettingResponse(BaseModel):
    success: bool
    message: str
    data: Optional[Dict[str, Any]] = None

class EventLogResponse(BaseModel):
    success: bool
    message: str
    data: Optional[List[EventLog]] = None

class DatabaseTestResponse(BaseModel):
    success: bool
    message: str
    connection_info: Optional[Dict[str, Any]] = None
