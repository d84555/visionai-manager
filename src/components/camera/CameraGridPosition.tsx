
import React from 'react';
import { VideoIcon, Square, Loader, Camera, PlayCircle, Pin, PinOff, Play, Pause } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { DetectionOverlay } from '@/components/video/DetectionOverlay';
import VideoFeed from '@/components/video/VideoFeed';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

interface CameraGridPositionProps {
  positionId: string;
  camera: any;
  isPlaying: boolean;
  isFullscreen: boolean;
  streamType: 'main' | 'sub';
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent, positionId: string) => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onToggleStream: (positionId: string) => void;
  onFullscreen: (positionId: string) => void;
  onStreamTypeChange: (cameraId: string, streamType: 'main' | 'sub') => void;
  onApplyModelToCamera: (cameraId: string, modelId: string) => void;
  availableModels: { id: string; name: string }[];
  getCameraModel: (cameraId: string) => { name: string; path: string } | null;
  dragOverPosition: string | null;
}

const CameraGridPosition: React.FC<CameraGridPositionProps> = ({
  positionId,
  camera,
  isPlaying,
  isFullscreen,
  streamType,
  onDragOver,
  onDragLeave,
  onDrop,
  onContextMenu,
  onToggleStream,
  onFullscreen,
  onStreamTypeChange,
  onApplyModelToCamera,
  availableModels,
  getCameraModel,
  dragOverPosition,
}) => {
  // If we have a camera assigned to this position
  if (camera) {
    const activeModel = getCameraModel(camera.id);
    
    return (
      <div
        id={`camera-${positionId}`}
        className={`relative border rounded-md overflow-hidden ${isFullscreen ? 'fixed inset-0 z-50 bg-black' : ''}`}
        onContextMenu={onContextMenu}
      >
        <div className="absolute top-2 left-2 z-20 bg-black/70 text-white text-xs px-2 py-1 rounded">
          {camera.name}
        </div>
        
        <div className="relative w-full h-full">
          <VideoFeed
            showControls={false}
            camera={camera}
            autoStart={isPlaying}
            isPinned={isFullscreen}
            onPinToggle={() => onFullscreen(positionId)}
            activeModel={activeModel}
            streamType={streamType}
          />
        </div>
        
        <div className="absolute bottom-2 right-2 z-20 flex gap-1">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-7 w-7 bg-black/70 text-white hover:bg-black/90"
                  onClick={() => onToggleStream(positionId)}
                >
                  {isPlaying ? <Pause size={14} /> : <Play size={14} />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{isPlaying ? 'Pause Stream' : 'Play Stream'}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-7 w-7 bg-black/70 text-white hover:bg-black/90"
                  onClick={() => onFullscreen(positionId)}
                >
                  {isFullscreen ? <PinOff size={14} /> : <Pin size={14} />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-7 w-7 bg-black/70 text-white hover:bg-black/90"
              >
                <Camera size={14} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem 
                onClick={() => onStreamTypeChange(camera.id, 'main')}
                className={streamType === 'main' ? 'bg-gray-100 dark:bg-gray-800' : ''}
              >
                Main Stream (HD)
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => onStreamTypeChange(camera.id, 'sub')}
                className={streamType === 'sub' ? 'bg-gray-100 dark:bg-gray-800' : ''}
              >
                Sub Stream (SD)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-7 w-7 bg-black/70 text-white hover:bg-black/90"
              >
                <Square size={14} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem 
                onClick={() => onApplyModelToCamera(camera.id, 'none')}
                className={!activeModel ? 'bg-gray-100 dark:bg-gray-800' : ''}
              >
                No AI Model
              </DropdownMenuItem>
              {availableModels.map(model => (
                <DropdownMenuItem 
                  key={model.id}
                  onClick={() => onApplyModelToCamera(camera.id, model.id)}
                  className={activeModel?.name === model.name ? 'bg-gray-100 dark:bg-gray-800' : ''}
                >
                  {model.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    );
  }
  
  // Empty grid position
  return (
    <div
      className={`border-2 border-dashed rounded-md bg-gray-50 dark:bg-gray-800/30 flex flex-col items-center justify-center p-4 h-[200px] transition-colors ${
        dragOverPosition === positionId ? 'border-avianet-red bg-avianet-red/5' : 'border-gray-200 dark:border-gray-700'
      }`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={(e) => onDrop(e, positionId)}
      onContextMenu={onContextMenu}
    >
      <VideoIcon className="text-gray-400 mb-2" size={32} />
      <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
        Drag and drop a camera here
      </p>
      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 text-center">
        Right-click to clear assignment
      </p>
    </div>
  );
};

export default CameraGridPosition;
