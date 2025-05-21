
import databaseService from './DatabaseService';
import { v4 as uuidv4 } from 'uuid';

export interface EventLog {
  id: string;
  type: string;
  category: string;
  message: string;
  details?: Record<string, any>;
  severity: 'low' | 'medium' | 'high' | 'critical';
  created_at: string;
  acknowledged: boolean;
  acknowledged_at?: string;
  acknowledged_by?: string;
}

export interface EventLogOptions {
  type: string;
  category: 'ppe' | 'zone' | 'environment' | 'system';
  message: string;
  details?: Record<string, any>;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

class EventLogService {
  // Log an event to the database
  async logEvent(options: EventLogOptions): Promise<EventLog | null> {
    try {
      const { type, category, message, details, severity } = options;
      const eventId = uuidv4();
      
      const query = `
        INSERT INTO events(
          id, type, category, message, details, severity, created_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP
        ) RETURNING *
      `;
      
      const result = await databaseService.query<EventLog>(
        query, 
        [eventId, type, category, message, details || {}, severity]
      );
      
      if (result && result.length > 0) {
        return result[0];
      }
      
      return null;
    } catch (error) {
      console.error('Failed to log event', error);
      return null;
    }
  }

  // Get events with optional filtering
  async getEvents(options?: {
    type?: string;
    category?: string;
    severity?: string;
    acknowledged?: boolean;
    startDate?: string;
    endDate?: string;
    limit?: number;
    offset?: number;
  }): Promise<EventLog[]> {
    try {
      const { 
        type, category, severity, acknowledged, 
        startDate, endDate, limit = 100, offset = 0 
      } = options || {};
      
      let query = 'SELECT * FROM events WHERE 1=1';
      const params: any[] = [];
      let paramIndex = 1;
      
      if (type) {
        query += ` AND type = $${paramIndex}`;
        params.push(type);
        paramIndex++;
      }
      
      if (category) {
        query += ` AND category = $${paramIndex}`;
        params.push(category);
        paramIndex++;
      }
      
      if (severity) {
        query += ` AND severity = $${paramIndex}`;
        params.push(severity);
        paramIndex++;
      }
      
      if (acknowledged !== undefined) {
        query += ` AND acknowledged = $${paramIndex}`;
        params.push(acknowledged);
        paramIndex++;
      }
      
      if (startDate) {
        query += ` AND created_at >= $${paramIndex}`;
        params.push(startDate);
        paramIndex++;
      }
      
      if (endDate) {
        query += ` AND created_at <= $${paramIndex}`;
        params.push(endDate);
        paramIndex++;
      }
      
      query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
      params.push(limit, offset);
      
      const result = await databaseService.query<EventLog>(query, params);
      return result || [];
    } catch (error) {
      console.error('Failed to get events', error);
      return [];
    }
  }

  // Acknowledge an event
  async acknowledgeEvent(eventId: string, acknowledgedBy: string): Promise<boolean> {
    try {
      const query = `
        UPDATE events 
        SET acknowledged = true, acknowledged_at = CURRENT_TIMESTAMP, acknowledged_by = $1
        WHERE id = $2
      `;
      
      await databaseService.query(query, [acknowledgedBy, eventId]);
      return true;
    } catch (error) {
      console.error('Failed to acknowledge event', error);
      return false;
    }
  }

  // Delete events older than X days
  async cleanupOldEvents(daysToKeep: number): Promise<number> {
    try {
      const query = `
        DELETE FROM events 
        WHERE created_at < NOW() - INTERVAL '${daysToKeep} days'
        RETURNING id
      `;
      
      const result = await databaseService.query(query);
      return result.length;
    } catch (error) {
      console.error('Failed to clean up old events', error);
      return 0;
    }
  }
}

const eventLogService = new EventLogService();
export default eventLogService;
