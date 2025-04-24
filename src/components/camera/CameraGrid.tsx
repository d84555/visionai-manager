
import React from 'react';
import { useCameraGrid } from '@/hooks/useCameraGrid';
import CameraGridHeader from './CameraGridHeader';
import CameraGridPosition from './CameraGridPosition';
import CameraService from '@/services/CameraService';
import { toast } from 'sonner';
import { Camera } from '@/services/CameraService';

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

  const getAssignedCamera = (positionId: string): Camera | null => {
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
    setCameraStreamTypes(prev => ({
      ...prev,
      [cameraId]: streamType
    }));
    toast.success(`Switched to ${streamType} stream`);
  };

  const toggleAllStreams = (play: boolean) => {
    const newPlayingStreams = { ...playingStreams };
    Object.keys(cameraAssignments).forEach(positionId => {
      newPlayingStreams[positionId] = play;
    });
    setPlayingStreams(newPlayingStreams);
    toast.success(play ? 'Starting all streams' : 'Stopping all streams');
  };

  const toggleStream = (positionId: string) => {
    setPlayingStreams(prev => ({
      ...prev,
      [positionId]: !prev[positionId]
    }));
  };

  const handleDrop = (e: React.DragEvent, positionId: string) => {
    e.preventDefault();
    setDragOverPosition(null);
    
    const cameraId = e.dataTransfer.getData('text/plain');
    const camera = cameras.find(c => c.id === cameraId);
    
    if (cameraId && cameraId.length > 0 && camera && onClearAssignment) {
      const newAssignments = { ...cameraAssignments };
      newAssignments[positionId] = cameraId;
      
      localStorage.setItem('camera-grid-assignments', JSON.stringify(newAssignments));
      toast.success('Camera assigned to grid position');
      window.location.reload();
    }
  };

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

          return (
            <CameraGridPosition
              key={positionId}
              positionId={positionId}
              camera={assignedCamera}
              isPlaying={playingStreams[positionId]}
              isFullscreen={fullscreenCamera === positionId}
              streamType={streamType}
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
                }
              }}
              onToggleStream={toggleStream}
              onFullscreen={handleFullscreenCamera}
              onStreamTypeChange={handleStreamTypeChange}
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
