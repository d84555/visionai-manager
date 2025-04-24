
import React from 'react';
import { Play, CircleStop, Maximize, Minimize, RefreshCw, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface CameraGridHeaderProps {
  isRefreshing: boolean;
  isFullscreen: boolean;
  onToggleAllStreams: (play: boolean) => void;
  onFullscreenGrid: () => void;
  onRefreshStatuses: () => void;
  onApplyModelToAll: (modelId: string | null) => void;
  availableModels: Array<{ id: string; name: string }>;
}

const CameraGridHeader: React.FC<CameraGridHeaderProps> = ({
  isRefreshing,
  isFullscreen,
  onToggleAllStreams,
  onFullscreenGrid,
  onRefreshStatuses,
  onApplyModelToAll,
  availableModels
}) => {
  return (
    <div className="flex justify-between items-center mb-4">
      <h3 className="text-lg font-medium">Camera Feeds</h3>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onToggleAllStreams(true)}
          className="flex items-center"
        >
          <Play className="mr-2 h-4 w-4" />
          Play All
        </Button>
        
        <Button
          variant="outline"
          size="sm"
          onClick={() => onToggleAllStreams(false)}
          className="flex items-center"
        >
          <CircleStop className="mr-2 h-4 w-4" />
          Stop All
        </Button>
        
        <Button
          variant="outline"
          size="sm"
          onClick={onFullscreenGrid}
          className="flex items-center"
        >
          {isFullscreen ? 
            <Minimize className="mr-2 h-4 w-4" /> : 
            <Maximize className="mr-2 h-4 w-4" />
          }
          {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen Grid'}
        </Button>
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <Layers className="mr-2 h-4 w-4" />
              Apply Model
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Apply Model to All Cameras</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onApplyModelToAll(null)}>
              Use Global AI Model
            </DropdownMenuItem>
            {availableModels.map(model => (
              <DropdownMenuItem key={model.id} onClick={() => onApplyModelToAll(model.id)}>
                {model.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        
        <Button 
          variant="outline" 
          size="sm" 
          onClick={onRefreshStatuses}
          disabled={isRefreshing}
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          Refresh Status
        </Button>
      </div>
    </div>
  );
};

export default CameraGridHeader;
