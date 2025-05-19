
from fastapi import APIRouter, HTTPException, Query
from typing import List, Optional, Dict, Any
from pydantic import BaseModel
from datetime import datetime, timedelta
import uuid
import logging
import json
import os

router = APIRouter()
logger = logging.getLogger(__name__)

# Define Pydantic models for event handling
class EventCoordinates(BaseModel):
    x: int
    y: int

class EventMetadata(BaseModel):
    camera: str
    zone: str
    frameId: Optional[int] = None
    user: Optional[str] = None
    objectType: Optional[str] = None
    confidence: Optional[float] = None
    action: Optional[str] = None

class EventCreate(BaseModel):
    eventTypeId: str
    category: str
    timestamp: Optional[datetime] = None
    coordinates: Optional[EventCoordinates] = None
    metadata: EventMetadata
    description: Optional[str] = None
    
class Event(EventCreate):
    id: str
    timestamp: datetime

class EventsResponse(BaseModel):
    events: List[Event]
    total: int
    page: int
    pageSize: int
    
# In-memory storage for events (would be replaced with a database in production)
events_store = []

@router.post("/", response_model=Event)
async def create_event(event: EventCreate):
    """Create a new event"""
    # Generate a UUID for the event
    event_id = str(uuid.uuid4())
    
    # Set timestamp if not provided
    if not event.timestamp:
        event.timestamp = datetime.now()
        
    # Create event object
    new_event = {
        "id": event_id,
        **event.dict()
    }
    
    # Store the event
    events_store.append(new_event)
    logger.info(f"Created new event {event_id}: {event.category} - {event.eventTypeId}")
    
    return new_event

@router.get("/", response_model=EventsResponse)
async def list_events(
    category: Optional[str] = None,
    event_type_id: Optional[str] = Query(None, alias="eventTypeId"),
    start_date: Optional[datetime] = Query(None, alias="startDate"),
    end_date: Optional[datetime] = Query(None, alias="endDate"),
    page: int = 1,
    page_size: int = 50
):
    """List events with optional filtering"""
    filtered_events = events_store
    
    # Apply filters
    if category:
        filtered_events = [e for e in filtered_events if e["category"] == category]
    
    if event_type_id:
        filtered_events = [e for e in filtered_events if e["eventTypeId"] == event_type_id]
    
    if start_date:
        filtered_events = [e for e in filtered_events if e["timestamp"] >= start_date]
        
    if end_date:
        filtered_events = [e for e in filtered_events if e["timestamp"] <= end_date]
    
    # Sort by timestamp (newest first)
    filtered_events = sorted(filtered_events, key=lambda x: x["timestamp"], reverse=True)
    
    # Apply pagination
    start_idx = (page - 1) * page_size
    end_idx = start_idx + page_size
    paginated_events = filtered_events[start_idx:end_idx]
    
    # Return the response
    return {
        "events": paginated_events,
        "total": len(filtered_events),
        "page": page,
        "pageSize": page_size
    }

@router.get("/{event_id}", response_model=Event)
async def get_event(event_id: str):
    """Get a specific event by ID"""
    for event in events_store:
        if event["id"] == event_id:
            return event
    
    raise HTTPException(status_code=404, detail=f"Event with ID {event_id} not found")

@router.get("/recent/{category}", response_model=List[Event])
async def get_recent_events(category: str, limit: int = 10):
    """Get recent events for a specific category"""
    filtered_events = [e for e in events_store if e["category"] == category]
    
    # Sort by timestamp (newest first) and limit
    sorted_events = sorted(filtered_events, key=lambda x: x["timestamp"], reverse=True)[:limit]
    
    return sorted_events

@router.get("/stats", response_model=Dict[str, Any])
async def get_event_stats():
    """Get statistics about events"""
    if not events_store:
        return {
            "totalEvents": 0,
            "byCategory": {},
            "byEventType": {}
        }
        
    # Calculate statistics
    total = len(events_store)
    
    # Count by category
    category_counts = {}
    for event in events_store:
        category = event["category"]
        category_counts[category] = category_counts.get(category, 0) + 1
    
    # Count by event type
    event_type_counts = {}
    for event in events_store:
        event_type = event["eventTypeId"]
        event_type_counts[event_type] = event_type_counts.get(event_type, 0) + 1
    
    # Get events by day (for the last 7 days)
    today = datetime.now().date()
    days = [today - timedelta(days=i) for i in range(7)]
    days.reverse()  # Oldest first
    
    events_by_day = {}
    for day in days:
        day_str = day.isoformat()
        events_by_day[day_str] = sum(
            1 for event in events_store 
            if event["timestamp"].date() == day
        )
    
    return {
        "totalEvents": total,
        "byCategory": category_counts,
        "byEventType": event_type_counts,
        "byDay": events_by_day
    }
