
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import SettingsService, { EventTypeConfig } from '@/services/SettingsService';

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

interface AlertContextType {
  alerts: Alert[];
  setAlerts: React.Dispatch<React.SetStateAction<Alert[]>>;
  addAlert: (alert: Omit<Alert, 'id'>) => void;
  updateAlertStatus: (id: string, status: 'new' | 'reviewed' | 'ignored') => void;
  clearAlerts: () => void;
  loadingAlerts: boolean;
  error: string | null;
}

const AlertContext = createContext<AlertContextType | undefined>(undefined);

export interface AlertProviderProps {
  children: ReactNode;
  mockData?: boolean;
  rtspFeedUrls?: string[];
  uploadedVideoUrls?: string[];
}

export const AlertProvider: React.FC<AlertProviderProps> = ({ 
  children,
  mockData = true,
  rtspFeedUrls = [],
  uploadedVideoUrls = []
}) => {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loadingAlerts, setLoadingAlerts] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const addAlert = (alertData: Omit<Alert, 'id'>) => {
    const newAlert: Alert = {
      ...alertData,
      id: `alert-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
    };
    
    setAlerts(prevAlerts => [newAlert, ...prevAlerts]);
  };

  const updateAlertStatus = (id: string, status: 'new' | 'reviewed' | 'ignored') => {
    setAlerts(prevAlerts => 
      prevAlerts.map(alert => 
        alert.id === id ? { ...alert, status } : alert
      )
    );
  };

  const clearAlerts = () => {
    setAlerts([]);
  };

  // Load mock data if no real sources are provided
  useEffect(() => {
    if (mockData && alerts.length === 0) {
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
  }, [mockData]);

  // Connect to real-time sources (RTSP feeds)
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

  // Process uploaded videos
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

  const contextValue: AlertContextType = {
    alerts,
    setAlerts,
    addAlert,
    updateAlertStatus,
    clearAlerts,
    loadingAlerts,
    error
  };

  return (
    <AlertContext.Provider value={contextValue}>
      {children}
    </AlertContext.Provider>
  );
};

export const useAlerts = (): AlertContextType => {
  const context = useContext(AlertContext);
  if (context === undefined) {
    throw new Error('useAlerts must be used within an AlertProvider');
  }
  return context;
};
