import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import SettingsService, { EventTypeConfig } from '@/services/SettingsService';
import DBSettingsService from '@/services/DBSettingsService';
import DatabaseService from '@/services/DatabaseService';
import DatabaseEventService from '@/services/DatabaseEventService';
import { toast } from 'sonner';

export interface Alert {
  id: string;
  timestamp: Date;
  eventType: EventTypeConfig;
  confidence: number;
  coordinates: { x: number; y: number };
  status: 'new' | 'reviewed' | 'ignored';
  metadata: {
    camera: string;
    zone: string;
    frameId: number;
    sourceType?: 'rtsp' | 'upload' | 'mock';
    sourceUrl?: string;
  };
}

interface DBAlertContextType {
  alerts: Alert[];
  setAlerts: React.Dispatch<React.SetStateAction<Alert[]>>;
  addAlert: (alert: Omit<Alert, 'id'>) => void;
  updateAlertStatus: (id: string, status: 'new' | 'reviewed' | 'ignored') => void;
  clearAlerts: () => void;
  loadingAlerts: boolean;
  error: string | null;
  isDbConnected: boolean;
}

const DBAlertContext = createContext<DBAlertContextType | undefined>(undefined);

export interface DBAlertProviderProps {
  children: ReactNode;
  mockData?: boolean;
  rtspFeedUrls?: string[];
  uploadedVideoUrls?: string[];
  enableHLS?: boolean;
}

export const DBAlertProvider: React.FC<DBAlertProviderProps> = ({ 
  children,
  mockData = true,
  rtspFeedUrls = [],
  uploadedVideoUrls = [],
  enableHLS = true
}) => {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loadingAlerts, setLoadingAlerts] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isDbConnected, setIsDbConnected] = useState<boolean>(false);

  // Check database connection on component mount
  useEffect(() => {
    checkDbConnection();
  }, []);

  const checkDbConnection = async () => {
    try {
      const connected = await DatabaseService.testConnection();
      setIsDbConnected(connected);
      
      if (connected) {
        // Load alerts from database
        await loadAlertsFromDatabase();
      }
    } catch (err) {
      console.error('Error checking database connection:', err);
      setIsDbConnected(false);
    }
  };

  const loadAlertsFromDatabase = async () => {
    setLoadingAlerts(true);
    try {
      // Get the latest 50 events from the database
      const events = await DatabaseEventService.getEvents(50, 0);
      
      // Convert events to alerts
      const loadedAlerts: Alert[] = events.map(event => ({
        id: `db-alert-${event.id}`,
        timestamp: event.timestamp,
        eventType: event.eventType,
        confidence: event.metadata.confidence || 0.8,
        coordinates: event.metadata.coordinates || { x: 0, y: 0 },
        status: event.metadata.status || 'new',
        metadata: {
          camera: event.metadata.camera || 'Unknown Camera',
          zone: event.metadata.zone || 'Unknown Zone',
          frameId: event.metadata.frameId || 0,
          sourceType: event.metadata.sourceType,
          sourceUrl: event.metadata.sourceUrl
        }
      }));
      
      setAlerts(loadedAlerts);
    } catch (err) {
      console.error('Error loading alerts from database:', err);
      setError('Failed to load alerts from database');
    } finally {
      setLoadingAlerts(false);
    }
  };

  const addAlert = async (alertData: Omit<Alert, 'id'>) => {
    // Generate a client-side ID for immediate UI feedback
    const clientId = `alert-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    
    const newAlert: Alert = {
      ...alertData,
      id: clientId
    };
    
    // Update the state immediately for responsive UI
    setAlerts(prevAlerts => [newAlert, ...prevAlerts]);
    
    // Save to database if connected
    if (isDbConnected) {
      try {
        // Log the event to the database
        const eventId = await DatabaseEventService.logEvent({
          eventType: alertData.eventType,
          message: `${alertData.eventType.name} detected with ${Math.round(alertData.confidence * 100)}% confidence`,
          metadata: {
            confidence: alertData.confidence,
            coordinates: alertData.coordinates,
            status: 'new',
            camera: alertData.metadata.camera,
            zone: alertData.metadata.zone,
            frameId: alertData.metadata.frameId,
            sourceType: alertData.metadata.sourceType,
            sourceUrl: alertData.metadata.sourceUrl
          },
          timestamp: alertData.timestamp
        });
        
        // Update the ID to match the database ID
        const dbId = `db-alert-${eventId}`;
        
        // Update the alert with the database ID
        setAlerts(prevAlerts => 
          prevAlerts.map(alert => 
            alert.id === clientId ? { ...alert, id: dbId } : alert
          )
        );
      } catch (err) {
        console.error('Error saving alert to database:', err);
        // Keep the client-generated ID if database save fails
      }
    }
  };

  const updateAlertStatus = async (id: string, status: 'new' | 'reviewed' | 'ignored') => {
    // Update the state immediately for responsive UI
    setAlerts(prevAlerts => 
      prevAlerts.map(alert => 
        alert.id === id ? { ...alert, status } : alert
      )
    );
    
    // Update in database if connected and this is a database alert
    if (isDbConnected && id.startsWith('db-alert-')) {
      try {
        const dbId = parseInt(id.replace('db-alert-', ''), 10);
        
        // We need to update the metadata JSON column
        const query = `
          UPDATE events
          SET metadata = jsonb_set(metadata, '{status}', '"${status}"')
          WHERE id = $1
        `;
        
        await DatabaseService.query(query, [dbId]);
      } catch (err) {
        console.error('Error updating alert status in database:', err);
      }
    }
  };

  const clearAlerts = () => {
    setAlerts([]);
  };

  // Load mock data if requested and database is not connected
  useEffect(() => {
    if (mockData && alerts.length === 0 && !isDbConnected) {
      setLoadingAlerts(true);
      
      try {
        const configuredEventTypes = SettingsService.getEventTypes();
        
        // Only use event types that are configured to notify and are enabled
        const alertEventTypes = configuredEventTypes.filter(
          eventType => eventType.enabled && eventType.notifyOnTriggered
        );
        
        const generateMockAlerts = () => {
          const cameraNames = ['Front Entrance', 'Parking Lot', 'Loading Dock', 'Perimeter'];
          const zones = ['Zone A', 'Zone B', 'Zone C', 'Restricted Area'];
          const statuses: ('new' | 'reviewed' | 'ignored')[] = ['new', 'reviewed', 'ignored'];
          
          const mockAlerts: Alert[] = [];
          
          for (let i = 0; i < 20; i++) {
            const timestamp = new Date();
            timestamp.setHours(timestamp.getHours() - Math.random() * 24);
            
            // Select a random event type from the alertable ones
            const eventType = alertEventTypes[Math.floor(Math.random() * alertEventTypes.length)];
            
            // Add the alert
            mockAlerts.push({
              id: `alert-${Date.now()}-${i}`,
              timestamp,
              eventType,
              confidence: 0.7 + (Math.random() * 0.3),
              coordinates: {
                x: Math.floor(Math.random() * 1280),
                y: Math.floor(Math.random() * 720)
              },
              status: statuses[Math.floor(Math.random() * statuses.length)],
              metadata: {
                camera: cameraNames[Math.floor(Math.random() * cameraNames.length)],
                zone: zones[Math.floor(Math.random() * zones.length)],
                frameId: Math.floor(Math.random() * 10000),
                sourceType: 'mock'
              }
            });
          }
          
          mockAlerts.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
          
          setAlerts(mockAlerts);
        };
        
        if (alertEventTypes.length > 0) {
          generateMockAlerts();
        }
        
      } catch (err) {
        setError('Error loading mock data');
        console.error('Error generating mock alerts:', err);
      } finally {
        setLoadingAlerts(false);
      }
    }
  }, [mockData, isDbConnected]);

  // Connect to real-time sources (RTSP feeds) - same as AlertContext implementation
  useEffect(() => {
    if (rtspFeedUrls && rtspFeedUrls.length > 0) {
      // This would be the connection to actual RTSP streams
      // Using a placeholder for now - in a real implementation you would:
      // 1. Connect to the RTSP streams
      // 2. Process frames through an AI model
      // 3. Generate alerts based on detections
      
      console.log(`Connected to ${rtspFeedUrls.length} RTSP feeds`);
      
      // Simulate receiving occasional alerts from RTSP feeds
      const rtspInterval = setInterval(() => {
        const configuredEventTypes = SettingsService.getEventTypes();
        const enabledEventTypes = configuredEventTypes.filter(
          eventType => eventType.enabled && eventType.notifyOnTriggered
        );
        
        if (enabledEventTypes.length > 0 && Math.random() > 0.7) {
          const randomFeedIndex = Math.floor(Math.random() * rtspFeedUrls.length);
          const eventType = enabledEventTypes[Math.floor(Math.random() * enabledEventTypes.length)];
          
          addAlert({
            timestamp: new Date(),
            eventType,
            confidence: 0.75 + (Math.random() * 0.2),
            coordinates: {
              x: Math.floor(Math.random() * 1280),
              y: Math.floor(Math.random() * 720)
            },
            status: 'new',
            metadata: {
              camera: `RTSP Camera ${randomFeedIndex + 1}`,
              zone: 'Monitored Zone',
              frameId: Math.floor(Math.random() * 10000),
              sourceType: 'rtsp',
              sourceUrl: rtspFeedUrls[randomFeedIndex]
            }
          });
        }
      }, 30000); // Add a new alert roughly every 30 seconds
      
      return () => clearInterval(rtspInterval);
    }
  }, [rtspFeedUrls]);

  // Process uploaded videos - same as AlertContext implementation
  useEffect(() => {
    if (uploadedVideoUrls && uploadedVideoUrls.length > 0) {
      // In a real implementation, you would:
      // 1. Process each video through the AI model
      // 2. Generate alerts based on detections
      
      console.log(`Processing ${uploadedVideoUrls.length} uploaded videos`);
      
      // Simulate processing and finding alerts in uploaded videos
      uploadedVideoUrls.forEach((videoUrl, index) => {
        const configuredEventTypes = SettingsService.getEventTypes();
        const enabledEventTypes = configuredEventTypes.filter(
          eventType => eventType.enabled && eventType.notifyOnTriggered
        );
        
        if (enabledEventTypes.length > 0) {
          // Generate 1-3 alerts per uploaded video
          const alertCount = Math.floor(Math.random() * 3) + 1;
          
          for (let i = 0; i < alertCount; i++) {
            const eventType = enabledEventTypes[Math.floor(Math.random() * enabledEventTypes.length)];
            
            // Add alerts with increasing timestamps (older to newer)
            const timestamp = new Date();
            timestamp.setMinutes(timestamp.getMinutes() - (index * 5) - i);
            
            addAlert({
              timestamp,
              eventType,
              confidence: 0.8 + (Math.random() * 0.15),
              coordinates: {
                x: Math.floor(Math.random() * 1280),
                y: Math.floor(Math.random() * 720)
              },
              status: 'new',
              metadata: {
                camera: `Uploaded Video ${index + 1}`,
                zone: 'Video Analysis',
                frameId: Math.floor(Math.random() * 10000),
                sourceType: 'upload',
                sourceUrl: videoUrl
              }
            });
          }
        }
      });
    }
  }, [uploadedVideoUrls]);

  const contextValue: DBAlertContextType = {
    alerts,
    setAlerts,
    addAlert,
    updateAlertStatus,
    clearAlerts,
    loadingAlerts,
    error,
    isDbConnected
  };

  return (
    <DBAlertContext.Provider value={contextValue}>
      {children}
    </DBAlertContext.Provider>
  );
};

export const useDBAlerts = (): DBAlertContextType => {
  const context = useContext(DBAlertContext);
  if (context === undefined) {
    throw new Error('useDBAlerts must be used within a DBAlertProvider');
  }
  return context;
};
