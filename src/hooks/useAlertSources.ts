
import { useState, useEffect } from 'react';
import { useAlerts } from '@/contexts/AlertContext';
import SettingsService from '@/services/SettingsService';

interface AlertSourcesOptions {
  enableMockData?: boolean;
  autoConnect?: boolean;
}

interface AlertSourcesReturn {
  rtspFeeds: string[];
  addRtspFeed: (url: string) => void;
  removeRtspFeed: (url: string) => void;
  uploadedVideos: string[];
  addUploadedVideo: (url: string) => void;
  removeUploadedVideo: (url: string) => void;
  isConnected: boolean;
  connect: () => void;
  disconnect: () => void;
}

/**
 * Hook for managing alert data sources (RTSP streams and uploaded videos)
 */
export const useAlertSources = (options: AlertSourcesOptions = {}): AlertSourcesReturn => {
  const { enableMockData = true, autoConnect = true } = options;
  const { addAlert } = useAlerts();
  
  const [rtspFeeds, setRtspFeeds] = useState<string[]>([]);
  const [uploadedVideos, setUploadedVideos] = useState<string[]>([]);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  
  // Load any saved feeds from settings/localStorage
  useEffect(() => {
    const savedRtspFeeds = localStorage.getItem('alert-rtsp-feeds');
    const savedVideos = localStorage.getItem('alert-uploaded-videos');
    
    if (savedRtspFeeds) {
      try {
        setRtspFeeds(JSON.parse(savedRtspFeeds));
      } catch (err) {
        console.error('Error parsing saved RTSP feeds:', err);
      }
    }
    
    if (savedVideos) {
      try {
        setUploadedVideos(JSON.parse(savedVideos));
      } catch (err) {
        console.error('Error parsing saved uploaded videos:', err);
      }
    }
    
    // Auto-connect if option is enabled
    if (autoConnect) {
      setIsConnected(true);
    }
  }, [autoConnect]);
  
  // Save feeds when they change
  useEffect(() => {
    localStorage.setItem('alert-rtsp-feeds', JSON.stringify(rtspFeeds));
  }, [rtspFeeds]);
  
  useEffect(() => {
    localStorage.setItem('alert-uploaded-videos', JSON.stringify(uploadedVideos));
  }, [uploadedVideos]);
  
  // Add a new RTSP feed
  const addRtspFeed = (url: string) => {
    if (!rtspFeeds.includes(url)) {
      setRtspFeeds(prev => [...prev, url]);
    }
  };
  
  // Remove an RTSP feed
  const removeRtspFeed = (url: string) => {
    setRtspFeeds(prev => prev.filter(feed => feed !== url));
  };
  
  // Add an uploaded video
  const addUploadedVideo = (url: string) => {
    if (!uploadedVideos.includes(url)) {
      setUploadedVideos(prev => [...prev, url]);
      
      // Process this new video immediately if connected
      if (isConnected) {
        processUploadedVideo(url);
      }
    }
  };
  
  // Remove an uploaded video
  const removeUploadedVideo = (url: string) => {
    setUploadedVideos(prev => prev.filter(video => video !== url));
  };
  
  // Connect to all sources
  const connect = () => {
    setIsConnected(true);
  };
  
  // Disconnect from all sources
  const disconnect = () => {
    setIsConnected(false);
  };
  
  // Process a single uploaded video (simulated)
  const processUploadedVideo = (videoUrl: string) => {
    // In a real implementation, you would process the video with AI
    // This is a simplified simulation
    
    const configuredEventTypes = SettingsService.getEventTypes();
    const enabledEventTypes = configuredEventTypes.filter(
      eventType => eventType.enabled && eventType.notifyOnTriggered
    );
    
    if (enabledEventTypes.length > 0) {
      // Generate 1-3 alerts for this video
      const alertCount = Math.floor(Math.random() * 3) + 1;
      
      for (let i = 0; i < alertCount; i++) {
        const eventType = enabledEventTypes[Math.floor(Math.random() * enabledEventTypes.length)];
        
        // Slight delay to simulate processing time
        setTimeout(() => {
          addAlert({
            timestamp: new Date(),
            eventType,
            confidence: 0.8 + (Math.random() * 0.15),
            coordinates: {
              x: Math.floor(Math.random() * 1280),
              y: Math.floor(Math.random() * 720)
            },
            status: 'new',
            metadata: {
              camera: `Uploaded Video Analysis`,
              zone: 'Video Analysis Zone',
              frameId: Math.floor(Math.random() * 10000),
              sourceType: 'upload',
              sourceUrl: videoUrl
            }
          });
        }, i * 2000); // Spread alerts out over time
      }
    }
  };
  
  return {
    rtspFeeds,
    addRtspFeed,
    removeRtspFeed,
    uploadedVideos,
    addUploadedVideo,
    removeUploadedVideo,
    isConnected,
    connect,
    disconnect
  };
};
