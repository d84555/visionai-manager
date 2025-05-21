
import DatabaseService from './DatabaseService';
import { EventTypeConfig } from './SettingsService';

export interface AlertEvent {
  id?: number;
  eventType: EventTypeConfig;
  message: string;
  metadata: Record<string, any>;
  timestamp: Date;
}

class DatabaseEventService {
  private static instance: DatabaseEventService;
  
  private constructor() {}

  public static getInstance(): DatabaseEventService {
    if (!DatabaseEventService.instance) {
      DatabaseEventService.instance = new DatabaseEventService();
    }
    return DatabaseEventService.instance;
  }

  public async logEvent(event: Omit<AlertEvent, 'id'>): Promise<number> {
    try {
      const query = `
        INSERT INTO events (event_type, severity, message, metadata, timestamp)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id
      `;
      
      const result = await DatabaseService.query(query, [
        event.eventType.id,
        event.eventType.severity,
        event.message,
        JSON.stringify(event.metadata),
        event.timestamp
      ]);
      
      return result.rows[0].id;
    } catch (error) {
      console.error('Error logging event to database:', error);
      throw error;
    }
  }

  public async getEvents(limit: number = 100, offset: number = 0): Promise<AlertEvent[]> {
    try {
      const query = `
        SELECT e.id, e.event_type, e.message, e.metadata, e.timestamp, e.severity,
               et.name, et.category, et.enabled, et.notify_on_triggered AS "notifyOnTriggered",
               et.record_video AS "recordVideo", et.send_email AS "sendEmail", 
               et.description
        FROM events e
        LEFT JOIN event_types et ON e.event_type = et.id
        ORDER BY e.timestamp DESC
        LIMIT $1 OFFSET $2
      `;
      
      const result = await DatabaseService.query(query, [limit, offset]);
      
      return result.rows.map(row => ({
        id: row.id,
        eventType: {
          id: row.event_type,
          name: row.name,
          category: row.category,
          enabled: row.enabled,
          notifyOnTriggered: row.notifyOnTriggered,
          severity: row.severity,
          recordVideo: row.recordVideo,
          sendEmail: row.sendEmail,
          description: row.description
        },
        message: row.message,
        metadata: row.metadata,
        timestamp: new Date(row.timestamp)
      }));
    } catch (error) {
      console.error('Error getting events from database:', error);
      return [];
    }
  }

  public async getEventsByType(
    eventTypeId: string, 
    limit: number = 100, 
    offset: number = 0
  ): Promise<AlertEvent[]> {
    try {
      const query = `
        SELECT e.id, e.event_type, e.message, e.metadata, e.timestamp, e.severity,
               et.name, et.category, et.enabled, et.notify_on_triggered AS "notifyOnTriggered",
               et.record_video AS "recordVideo", et.send_email AS "sendEmail", 
               et.description
        FROM events e
        LEFT JOIN event_types et ON e.event_type = et.id
        WHERE e.event_type = $1
        ORDER BY e.timestamp DESC
        LIMIT $2 OFFSET $3
      `;
      
      const result = await DatabaseService.query(query, [eventTypeId, limit, offset]);
      
      return result.rows.map(row => ({
        id: row.id,
        eventType: {
          id: row.event_type,
          name: row.name,
          category: row.category,
          enabled: row.enabled,
          notifyOnTriggered: row.notifyOnTriggered,
          severity: row.severity,
          recordVideo: row.recordVideo,
          sendEmail: row.sendEmail,
          description: row.description
        },
        message: row.message,
        metadata: row.metadata,
        timestamp: new Date(row.timestamp)
      }));
    } catch (error) {
      console.error('Error getting events by type from database:', error);
      return [];
    }
  }

  public async getEventCount(): Promise<number> {
    try {
      const result = await DatabaseService.query('SELECT COUNT(*) FROM events');
      return parseInt(result.rows[0].count, 10);
    } catch (error) {
      console.error('Error getting event count from database:', error);
      return 0;
    }
  }

  public async deleteEvents(olderThanDays: number): Promise<number> {
    try {
      const query = `
        DELETE FROM events
        WHERE timestamp < NOW() - INTERVAL '${olderThanDays} days'
        RETURNING id
      `;
      
      const result = await DatabaseService.query(query);
      return result.rowCount;
    } catch (error) {
      console.error('Error deleting events from database:', error);
      return 0;
    }
  }
}

export default DatabaseEventService.getInstance();
