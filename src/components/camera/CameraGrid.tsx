
import React, { useState, useEffect } from 'react';
import { Camera as CameraIcon, RefreshCw } from 'lucide-react';
import { Camera } from '@/services/CameraService';
import CameraService from '@/services/CameraService';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import VideoFeed from '@/components/video/VideoFeed';
import { Badge } from '@/components/ui/badge';

interface CameraGridProps {
  layout?: '1x1' | '2x2' | '3x3' | '4x4';
}

const CameraGrid: React.FC<CameraGridProps> = ({ layout = '2x2' }) => {
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  useEffect(() => {
    loadCameras();
  }, []);
  
  const loadCameras = () => {
    const loadedCameras = CameraService.getAllCameras();
    setCameras(loadedCameras);
  };
  
  const handleRefreshStatuses = async () => {
    setIsRefreshing(true);
    try {
      await CameraService.refreshAllCameraStatuses();
      loadCameras();
    } catch (error) {
      console.error('Failed to refresh camera statuses:', error);
    } finally {
      setIsRefreshing(false);
    }
  };
  
  const getGridClassName = () => {
    switch (layout) {
      case '1x1': return 'grid-cols-1';
      case '2x2': return 'grid-cols-1 sm:grid-cols-2';
      case '3x3': return 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3';
      case '4x4': return 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4';
      default: return 'grid-cols-1 sm:grid-cols-2';
    }
  };
  
  const getCameraCount = () => {
    switch (layout) {
      case '1x1': return 1;
      case '2x2': return 4;
      case '3x3': return 9;
      case '4x4': return 16;
      default: return 4;
    }
  };
  
  // Only show the number of cameras based on the layout
  const visibleCameras = cameras.slice(0, getCameraCount());
  
  if (cameras.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center border rounded-md p-8 text-center">
        <CameraIcon className="h-12 w-12 text-gray-400 mb-4" />
        <h3 className="text-lg font-medium mb-2">No Cameras Configured</h3>
        <p className="text-sm text-muted-foreground">
          Add cameras in the Camera Management section to view live feeds
        </p>
      </div>
    );
  }
  
  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-medium">Camera Feeds</h3>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={handleRefreshStatuses}
          disabled={isRefreshing}
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          Refresh Status
        </Button>
      </div>
      
      <div className={`grid ${getGridClassName()} gap-4`}>
        {visibleCameras.map((camera) => (
          <Card key={camera.id} className="overflow-hidden">
            <CardHeader className="py-2 px-4 flex-row justify-between items-center bg-muted/30">
              <div className="flex items-center">
                <CameraIcon className="mr-2 h-4 w-4 text-avianet-red" />
                <span className="text-sm font-medium">{camera.name}</span>
              </div>
              <Badge
                variant={camera.isOnline ? "default" : "outline"}
                className={camera.isOnline ? "bg-green-500" : "text-red-500 border-red-500"}
              >
                {camera.isOnline ? "Online" : "Offline"}
              </Badge>
            </CardHeader>
            <CardContent className="p-0">
              <VideoFeed
                initialVideoUrl={CameraService.getPlayableStreamUrl(camera)}
                autoStart={camera.isOnline}
                showControls={false}
              />
            </CardContent>
          </Card>
        ))}
      </div>
      
      {cameras.length > getCameraCount() && (
        <p className="mt-4 text-center text-sm text-muted-foreground">
          {cameras.length - getCameraCount()} more cameras are configured but not shown in the current grid layout
        </p>
      )}
    </div>
  );
};

export default CameraGrid;
