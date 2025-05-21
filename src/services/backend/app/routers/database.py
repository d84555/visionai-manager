
from fastapi import APIRouter, HTTPException, Depends
from typing import Dict, Any, List, Optional
from datetime import datetime
import psycopg2
import psycopg2.extras
from app.models.database import (
    Setting, 
    EventLog, 
    DatabaseConfig, 
    EventFilterOptions,
    SettingResponse,
    EventLogResponse,
    DatabaseTestResponse
)

router = APIRouter()

# Store database configuration locally
db_config = DatabaseConfig()

# Helper function to get database connection
def get_db_connection():
    try:
        conn = psycopg2.connect(
            host=db_config.host,
            port=db_config.port,
            dbname=db_config.database,
            user=db_config.user,
            password=db_config.password,
            sslmode='require' if db_config.ssl else 'prefer'
        )
        return conn
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database connection failed: {str(e)}")

# Test database connection
@router.post("/db/test", response_model=DatabaseTestResponse)
async def test_connection(config: DatabaseConfig):
    global db_config
    
    try:
        # Update local config
        temp_config = db_config
        db_config = config
        
        # Test connection
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
        cursor.execute("SELECT NOW() as timestamp")
        result = cursor.fetchone()
        
        # Close connection
        cursor.close()
        conn.close()
        
        return {
            "success": True,
            "message": "Database connection successful",
            "connection_info": {
                "timestamp": result["timestamp"].isoformat(),
                "host": config.host,
                "database": config.database,
                "user": config.user
            }
        }
    except Exception as e:
        # Revert to previous config on failure
        db_config = temp_config
        return {
            "success": False,
            "message": f"Database connection failed: {str(e)}",
            "connection_info": None
        }

# Initialize database schema
@router.post("/db/init", response_model=SettingResponse)
async def initialize_schema():
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Create settings table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS settings (
                id SERIAL PRIMARY KEY,
                section VARCHAR(50) NOT NULL,
                key VARCHAR(100) NOT NULL,
                value JSONB NOT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(section, key)
            );
        """)
        
        # Create events table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS events (
                id VARCHAR(36) PRIMARY KEY,
                type VARCHAR(50) NOT NULL,
                category VARCHAR(50) NOT NULL,
                message TEXT NOT NULL,
                details JSONB,
                severity VARCHAR(20) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                acknowledged BOOLEAN DEFAULT FALSE,
                acknowledged_at TIMESTAMP,
                acknowledged_by VARCHAR(100)
            );
        """)
        
        conn.commit()
        cursor.close()
        conn.close()
        
        return {
            "success": True,
            "message": "Database schema initialized successfully"
        }
    except Exception as e:
        return {
            "success": False,
            "message": f"Failed to initialize schema: {str(e)}"
        }

# Get settings by section
@router.get("/db/settings/{section}", response_model=SettingResponse)
async def get_settings(section: str):
    try:
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
        
        cursor.execute(
            "SELECT value FROM settings WHERE section = %s AND key = %s",
            (section, "config")
        )
        
        result = cursor.fetchone()
        
        cursor.close()
        conn.close()
        
        if result:
            return {
                "success": True,
                "message": f"Settings found for section: {section}",
                "data": result["value"]
            }
        else:
            return {
                "success": False,
                "message": f"No settings found for section: {section}",
                "data": None
            }
    except Exception as e:
        return {
            "success": False,
            "message": f"Failed to get settings: {str(e)}",
            "data": None
        }

# Save settings
@router.post("/db/settings/{section}", response_model=SettingResponse)
async def save_settings(section: str, settings: Dict[str, Any]):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute(
            """
            INSERT INTO settings(section, key, value, updated_at)
            VALUES(%s, %s, %s, CURRENT_TIMESTAMP)
            ON CONFLICT(section, key)
            DO UPDATE SET value = %s, updated_at = CURRENT_TIMESTAMP
            """,
            (section, "config", psycopg2.extras.Json(settings), psycopg2.extras.Json(settings))
        )
        
        conn.commit()
        cursor.close()
        conn.close()
        
        return {
            "success": True,
            "message": f"Settings saved for section: {section}"
        }
    except Exception as e:
        return {
            "success": False,
            "message": f"Failed to save settings: {str(e)}"
        }

# Get all settings
@router.get("/db/settings", response_model=SettingResponse)
async def get_all_settings():
    try:
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
        
        cursor.execute("SELECT section, value FROM settings WHERE key = %s", ("config",))
        
        results = cursor.fetchall()
        
        cursor.close()
        conn.close()
        
        all_settings = {}
        for row in results:
            all_settings[row["section"]] = row["value"]
        
        return {
            "success": True,
            "message": "Retrieved all settings",
            "data": all_settings
        }
    except Exception as e:
        return {
            "success": False,
            "message": f"Failed to get all settings: {str(e)}",
            "data": {}
        }

# Log an event
@router.post("/db/events", response_model=EventLogResponse)
async def log_event(event: EventLog):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Set created_at if not provided
        if not event.created_at:
            event.created_at = datetime.now()
            
        cursor.execute(
            """
            INSERT INTO events(
                id, type, category, message, details, severity, 
                created_at, acknowledged, acknowledged_at, acknowledged_by
            )
            VALUES(%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id
            """,
            (
                event.id, event.type, event.category, event.message,
                psycopg2.extras.Json(event.details), event.severity,
                event.created_at, event.acknowledged, 
                event.acknowledged_at, event.acknowledged_by
            )
        )
        
        event_id = cursor.fetchone()[0]
        conn.commit()
        cursor.close()
        conn.close()
        
        return {
            "success": True,
            "message": f"Event logged with ID: {event_id}",
            "data": [event]
        }
    except Exception as e:
        return {
            "success": False,
            "message": f"Failed to log event: {str(e)}",
            "data": None
        }

# Get events with filtering
@router.post("/db/events/filter", response_model=EventLogResponse)
async def get_events(filter_options: EventFilterOptions):
    try:
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
        
        query = "SELECT * FROM events WHERE 1=1"
        params = []
        
        if filter_options.type:
            query += " AND type = %s"
            params.append(filter_options.type)
        
        if filter_options.category:
            query += " AND category = %s"
            params.append(filter_options.category)
            
        if filter_options.severity:
            query += " AND severity = %s"
            params.append(filter_options.severity)
            
        if filter_options.acknowledged is not None:
            query += " AND acknowledged = %s"
            params.append(filter_options.acknowledged)
            
        if filter_options.start_date:
            query += " AND created_at >= %s"
            params.append(filter_options.start_date)
            
        if filter_options.end_date:
            query += " AND created_at <= %s"
            params.append(filter_options.end_date)
            
        query += " ORDER BY created_at DESC LIMIT %s OFFSET %s"
        params.extend([filter_options.limit, filter_options.offset])
        
        cursor.execute(query, params)
        
        results = cursor.fetchall()
        cursor.close()
        conn.close()
        
        events = []
        for row in results:
            events.append(
                EventLog(
                    id=row["id"],
                    type=row["type"],
                    category=row["category"],
                    message=row["message"],
                    details=row["details"],
                    severity=row["severity"],
                    created_at=row["created_at"],
                    acknowledged=row["acknowledged"],
                    acknowledged_at=row["acknowledged_at"],
                    acknowledged_by=row["acknowledged_by"]
                )
            )
            
        return {
            "success": True,
            "message": f"Retrieved {len(events)} events",
            "data": events
        }
    except Exception as e:
        return {
            "success": False,
            "message": f"Failed to get events: {str(e)}",
            "data": None
        }

# Acknowledge an event
@router.put("/db/events/{event_id}/acknowledge", response_model=EventLogResponse)
async def acknowledge_event(event_id: str, acknowledged_by: str):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute(
            """
            UPDATE events 
            SET acknowledged = true, acknowledged_at = CURRENT_TIMESTAMP, acknowledged_by = %s
            WHERE id = %s
            RETURNING *
            """,
            (acknowledged_by, event_id)
        )
        
        result = cursor.fetchone()
        conn.commit()
        cursor.close()
        conn.close()
        
        if result:
            return {
                "success": True,
                "message": f"Event {event_id} acknowledged"
            }
        else:
            return {
                "success": False,
                "message": f"Event {event_id} not found"
            }
    except Exception as e:
        return {
            "success": False,
            "message": f"Failed to acknowledge event: {str(e)}"
        }

# Clean up old events
@router.delete("/db/events/cleanup/{days}", response_model=EventLogResponse)
async def cleanup_old_events(days: int):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute(
            """
            DELETE FROM events 
            WHERE created_at < NOW() - INTERVAL '%s days'
            RETURNING id
            """,
            (days,)
        )
        
        deleted_ids = cursor.fetchall()
        deleted_count = len(deleted_ids)
        
        conn.commit()
        cursor.close()
        conn.close()
        
        return {
            "success": True,
            "message": f"Deleted {deleted_count} events older than {days} days"
        }
    except Exception as e:
        return {
            "success": False,
            "message": f"Failed to clean up old events: {str(e)}"
        }
