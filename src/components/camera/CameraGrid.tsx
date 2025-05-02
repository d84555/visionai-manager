
import React, { useState, useEffect } from 'react';
import { Camera } from 'lucide-react';
import { useCameraGrid } from '@/hooks/useCameraGrid';
import CameraGridHeader from './CameraGridHeader';
import CameraGridPosition from './CameraGridPosition';
import CameraService from '@/services/CameraService';
import { toast } from 'sonner';
import { Camera as CameraType } from '@/services/CameraService';

interface CameraGridProps {
  layout?: '1x1' | '2x2' | '3x3' | '4x4';
  cameraAssignments?: Record<string, string>;
  onClearAssignment?: (gridPositionId: string) => void;
}

const CameraGrid: React.FC<CameraGridProps> = ({ 
  layout = '2x2',
  cameraAssignments = {},
  onClearAssignment 
}) => {
  const {
    cameras,
    isRefreshing,
    availableModels,
    dragOverPosition,
    playingStreams,
    isFullscreen,
    fullscreenCamera,
    cameraStreamTypes,
    setDragOverPosition,
    setPlayingStreams,
    setIsFullscreen,
    setFullscreenCamera,
    setCameraStreamTypes,
    handleRefreshStatuses,
    handleApplyModelToCamera,
    handleApplyModelToAll,
    getCameraModel
  } = useCameraGrid();
  
  const [streamErrors, setStreamErrors] = useState<Record<string, string>>({});

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

  const getAssignedCamera = (positionId: string): CameraType | null => {
    const cameraId = cameraAssignments[positionId];
    if (!cameraId) return null;
    return cameras.find(camera => camera.id === cameraId) || null;
  };

  const handleFullscreenGrid = async () => {
    const gridElement = document.getElementById('camera-grid');
    try {
      if (!document.fullscreenElement) {
        await gridElement?.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
        setFullscreenCamera(null);
      }
    } catch (err) {
      console.error('Fullscreen error:', err);
      toast.error('Fullscreen mode failed');
    }
  };

  const handleFullscreenCamera = async (positionId: string) => {
    if (fullscreenCamera === positionId) {
      document.exitFullscreen();
      setFullscreenCamera(null);
    } else {
      const cameraElement = document.getElementById(`camera-${positionId}`);
      try {
        await cameraElement?.requestFullscreen();
        setFullscreenCamera(positionId);
      } catch (err) {
        console.error('Fullscreen error:', err);
        toast.error('Fullscreen mode failed');
      }
    }
  };

  const handleStreamTypeChange = (cameraId: string, streamType: 'main' | 'sub') => {
    // Clear existing error for this camera when changing stream type
    setStreamErrors(prev => ({
      ...prev,
      [cameraId]: ''
    }));
    
    setCameraStreamTypes(prev => ({
      ...prev,
      [cameraId]: streamType
    }));
    
    toast.success(`Switched to ${streamType} stream`, {
      description: streamType === 'main' ? 'Higher quality, higher bandwidth' : 'Lower quality, lower bandwidth'
    });
  };

  const toggleAllStreams = (play: boolean) => {
    const newPlayingStreams = { ...playingStreams };
    Object.keys(cameraAssignments).forEach(positionId => {
      newPlayingStreams[positionId] = play;
    });
    setPlayingStreams(newPlayingStreams);
    
    if (play) {
      // Clear all stream errors when starting all streams
      setStreamErrors({});
      toast.success('Starting all camera streams');
    } else {
      toast.success('Stopping all camera streams');
    }
  };

  const toggleStream = (positionId: string) => {
    // Clear error for this position when toggling stream
    const cameraId = cameraAssignments[positionId];
    if (cameraId) {
      setStreamErrors(prev => ({
        ...prev,
        [cameraId]: ''
      }));
    }
    
    setPlayingStreams(prev => ({
      ...prev,
      [positionId]: !prev[positionId]
    }));
  };

  const handleStreamError = (positionId: string, error: string) => {
    const cameraId = cameraAssignments[positionId];
    if (cameraId) {
      setStreamErrors(prev => ({
        ...prev,
        [cameraId]: error
      }));
      
      // Stop the stream if it encounters an error
      setPlayingStreams(prev => ({
        ...prev,
        [positionId]: false
      }));
      
      toast.error('Camera stream error', {
        description: `Failed to connect to camera. Please check your network and camera status.`
      });
    }
  };

  const handleDrop = (e: React.DragEvent, positionId: string) => {
    e.preventDefault();
    setDragOverPosition(null);
    
    const cameraId = e.dataTransfer.getData('text/plain');
    const camera = cameras.find(c => c.id === cameraId);
    
    if (cameraId && cameraId.length > 0 && camera && onClearAssignment) {
      // Create a new assignments object with just this assignment - don't modify all existing ones
      const newAssignments = { ...cameraAssignments };
      
      // Check if this camera is already assigned to another position
      const existingPosition = Object.entries(newAssignments).find(
        ([pos, id]) => id === cameraId && pos !== positionId
      );
      
      // If found in another position, optionally warn the user
      if (existingPosition) {
        console.log(`Camera was already assigned to position ${existingPosition[0]}, moving to ${positionId}`);
      }
      
      newAssignments[positionId] = cameraId;
      
      // Update localStorage - but don't force refresh the page
      localStorage.setItem('camera-grid-assignments', JSON.stringify(newAssignments));
      
      // Clear any previous errors for this camera
      setStreamErrors(prev => ({
        ...prev,
        [cameraId]: ''
      }));
      
      toast.success(`Camera ${camera.name} assigned to grid position`);
    }
  };

  if (cameras.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center border rounded-md p-8 text-center">
        <Camera className="h-12 w-12 text-gray-400 mb-4" />
        <h3 className="text-lg font-medium mb-2">No Cameras Configured</h3>
        <p className="text-sm text-muted-foreground">
          Add cameras in the Camera Management section to view live feeds
        </p>
      </div>
    );
  }

  // Handle errors and retries for all positions
  useEffect(() => {
    // Reset stream errors when camera assignments change
    setStreamErrors({});
  }, [cameraAssignments]);

  return (
    <div>
      <CameraGridHeader 
        isRefreshing={isRefreshing}
        isFullscreen={isFullscreen}
        onToggleAllStreams={toggleAllStreams}
        onFullscreenGrid={handleFullscreenGrid}
        onRefreshStatuses={handleRefreshStatuses}
        onApplyModelToAll={handleApplyModelToAll}
        availableModels={availableModels}
      />
      
      <div 
        id="camera-grid" 
        className={`grid ${getGridClassName()} gap-4`}
      >
        {Array.from({ length: getCameraCount() }).map((_, i) => {
          const positionId = `position-${i}`;
          const assignedCamera = getAssignedCamera(positionId);
          const streamType = assignedCamera ? 
            (cameraStreamTypes[assignedCamera.id] || 'main') : 
            'main';
          const streamError = assignedCamera ? streamErrors[assignedCamera.id] : '';

          return (
            <CameraGridPosition
              key={`grid-${positionId}`}
              positionId={positionId}
              camera={assignedCamera}
              isPlaying={playingStreams[positionId]}
              isFullscreen={fullscreenCamera === positionId}
              streamType={streamType}
              streamError={streamError}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverPosition(positionId);
              }}
              onDragLeave={() => setDragOverPosition(null)}
              onDrop={handleDrop}
              onContextMenu={(e) => {
                e.preventDefault();
                if (onClearAssignment && cameraAssignments[positionId]) {
                  onClearAssignment(positionId);
                  
                  // Clear any errors when removing a camera
                  const cameraId = cameraAssignments[positionId];
                  if (cameraId) {
                    setStreamErrors(prev => {
                      const newErrors = { ...prev };
                      delete newErrors[cameraId];
                      return newErrors;
                    });
                  }
                }
              }}
              onToggleStream={toggleStream}
              onFullscreen={handleFullscreenCamera}
              onStreamTypeChange={handleStreamTypeChange}
              onStreamError={handleStreamError}
              onApplyModelToCamera={handleApplyModelToCamera}
              availableModels={availableModels}
              getCameraModel={getCameraModel}
              dragOverPosition={dragOverPosition}
            />
          );
        })}
      </div>
    </div>
  );
};

export default CameraGrid;
