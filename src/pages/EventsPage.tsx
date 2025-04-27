
import React, { useState, useEffect } from 'react';
import EventLogging from '@/components/events/EventLogging';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowUpRight, Box, Camera, Clock } from 'lucide-react';

const EventsPage = () => {
  const [detectionStats, setDetectionStats] = useState({
    lastDetectionCount: 0,
    totalDetections: 0,
    lastDetectionTime: null,
    activeModel: null
  });

  // Listen for detection events
  useEffect(() => {
    const handleDetectionEvent = (event) => {
      if (event.detail && Array.isArray(event.detail.detections)) {
        setDetectionStats(prev => ({
          lastDetectionCount: event.detail.detections.length,
          totalDetections: prev.totalDetections + event.detail.detections.length,
          lastDetectionTime: new Date(),
          activeModel: event.detail.modelName || prev.activeModel
        }));
      }
    };

    // Add event listener for custom detection event
    window.addEventListener('ai-detection', handleDetectionEvent);
    
    return () => {
      window.removeEventListener('ai-detection', handleDetectionEvent);
    };
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Event Logging</h1>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Last Detection Count</CardTitle>
            <Box className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{detectionStats.lastDetectionCount}</div>
            <p className="text-xs text-muted-foreground">
              Objects detected in last frame
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Detections</CardTitle>
            <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{detectionStats.totalDetections}</div>
            <p className="text-xs text-muted-foreground">
              Objects detected since page load
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Last Detection</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {detectionStats.lastDetectionTime ? 
                new Date(detectionStats.lastDetectionTime).toLocaleTimeString() : 
                'None'
              }
            </div>
            <p className="text-xs text-muted-foreground">
              Time of last detection event
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Model</CardTitle>
            <Camera className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold truncate" title={detectionStats.activeModel || 'None'}>
              {detectionStats.activeModel || 'None'}
            </div>
            <p className="text-xs text-muted-foreground">
              Currently active AI model
            </p>
          </CardContent>
        </Card>
      </div>
      
      <EventLogging />
    </div>
  );
};

export default EventsPage;
