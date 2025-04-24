
import React from 'react';
import { CameraIcon, Play, CircleStop, Maximize, Minimize, Settings } from 'lucide-react';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import VideoFeed from '@/components/video/VideoFeed';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import { Camera } from '@/services/CameraService';
import CameraService from '@/services/CameraService';

interface CameraGridPositionProps {
  positionId: string;
  camera: Camera | null;
  isPlaying: boolean;
  isFullscreen: boolean;
  streamType: 'main' | 'sub';
  onDragOver: (e: React.DragEvent, positionId: string) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent, positionId: string) => void;
  onContextMenu: (e: React.MouseEvent, positionId: string) => void;
  onToggleStream: (positionId: string) => void;
  onFullscreen: (positionId: string) => void;
  onStreamTypeChange: (cameraId: string, type: 'main' | 'sub') => void;
  onApplyModelToCamera: (cameraId: string, modelId: string | null) => void;
  availableModels: Array<{ id: string; name: string }>;
  getCameraModel: (cameraId: string) => { name: string; path: string } | undefined;
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
  return (
    <Card 
      className={`overflow-hidden ${
        dragOverPosition === positionId 
          ? 'ring-2 ring-avianet-red ring-opacity-70' 
          : ''
      }`}
      onDragOver={(e) => onDragOver(e, positionId)}
      onDragLeave={onDragLeave}
      onDrop={(e) => onDrop(e, positionId)}
      onContextMenu={(e) => onContextMenu(e, positionId)}
    >
      <CardHeader className="py-2 px-4 flex-row justify-between items-center bg-muted/30">
        <div className="flex items-center">
          <CameraIcon className="mr-2 h-4 w-4 text-avianet-red" />
          <span className="text-sm font-medium">
            {camera ? camera.name : `Grid Position ${parseInt(positionId.split('-')[1]) + 1}`}
          </span>
        </div>
        {camera && (
          <div className="flex items-center gap-2">
            <Badge
              variant={camera.isOnline ? "default" : "outline"}
              className={camera.isOnline ? "bg-green-500" : "text-red-500 border-red-500"}
            >
              {camera.isOnline ? "Online" : "Offline"}
            </Badge>
            
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => onToggleStream(positionId)}
            >
              {isPlaying ? 
                <CircleStop className="h-4 w-4" /> : 
                <Play className="h-4 w-4" />
              }
            </Button>
            
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => onFullscreen(positionId)}
            >
              {isFullscreen ? 
                <Minimize className="h-4 w-4" /> : 
                <Maximize className="h-4 w-4" />
              }
            </Button>
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                  <Settings className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Camera Settings</DropdownMenuLabel>
                <DropdownMenuSeparator />
                
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>Stream Type</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    <DropdownMenuItem 
                      onClick={() => onStreamTypeChange(camera.id, 'main')}
                      className={streamType === 'main' ? "bg-muted" : ""}
                    >
                      Main Stream
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      onClick={() => onStreamTypeChange(camera.id, 'sub')}
                      className={streamType === 'sub' ? "bg-muted" : ""}
                    >
                      Sub Stream
                    </DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                
                <DropdownMenuSeparator />
                <DropdownMenuLabel>AI Model</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => onApplyModelToCamera(camera.id, null)}>
                  Use Global AI Model
                </DropdownMenuItem>
                {availableModels.map(model => (
                  <DropdownMenuItem 
                    key={model.id} 
                    onClick={() => onApplyModelToCamera(camera.id, model.id)}
                  >
                    {model.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </CardHeader>
      <CardContent className="p-0" id={`camera-${positionId}`}>
        {camera ? (
          <div className={`${isFullscreen ? 'fullscreen-container' : ''}`}>
            <VideoFeed
              initialVideoUrl={CameraService.getPlayableStreamUrl(camera)}
              autoStart={isPlaying}
              showControls={false}
              camera={{
                id: camera.id,
                name: camera.name,
                streamUrl: {
                  main: CameraService.getPlayableStreamUrl({ ...camera, streamType: 'main' }),
                  sub: CameraService.getPlayableStreamUrl({ ...camera, streamType: 'sub' })
                }
              }}
              activeModel={getCameraModel(camera.id)}
              streamType={streamType}
              isPinned={false}
            />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center bg-gray-100 dark:bg-gray-800 h-[160px]">
            <div className="text-center text-muted-foreground">
              <p className="text-sm">Drop camera here</p>
              <p className="text-xs mt-1">or right-click to clear</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default CameraGridPosition;
