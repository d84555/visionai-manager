
import React from 'react';
import { Play, Pause, Pin, Server } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

// Update type definition to allow null or undefined as well
export type InferenceLocationType = 'edge' | 'server' | null | undefined;

interface VideoControlsProps {
  isPlaying: boolean;
  isPinned?: boolean;
  onPinToggle?: () => void;
  onPlayPause: () => void;
  inferenceLocation?: InferenceLocationType;
  inferenceTime?: number | null;
  isHikvisionFormat?: boolean;
  isLiveStream?: boolean;
  showMinimalControls?: boolean;
}

export const VideoControls: React.FC<VideoControlsProps> = ({
  isPlaying,
  isPinned,
  onPinToggle,
  onPlayPause,
  inferenceLocation,
  inferenceTime,
  isHikvisionFormat,
  isLiveStream,
  showMinimalControls = false
}) => {
  if (showMinimalControls) {
    return (
      <>
        <div className="absolute bottom-2 right-2 flex gap-1">
          {onPinToggle && (
            <Button 
              variant="outline" 
              size="icon"
              className={`h-6 w-6 bg-black/50 text-white hover:bg-black/70 ${isPinned ? 'bg-avianet-red hover:bg-avianet-red/90' : ''}`}
              onClick={onPinToggle}
            >
              <Pin size={12} className={isPinned ? 'text-white' : ''} />
            </Button>
          )}
          
          <Button 
            variant="outline" 
            size="icon"
            className="h-6 w-6 bg-black/50 text-white hover:bg-black/70"
            onClick={onPlayPause}
          >
            {isPlaying ? <Pause size={12} /> : <Play size={12} />}
          </Button>
        </div>
        
        {inferenceLocation && (
          <Badge 
            variant="outline" 
            className={`absolute top-2 right-2 text-[8px] ${
              inferenceLocation === 'edge' 
                ? 'bg-green-500/80 text-white' 
                : 'bg-yellow-500/80 text-white'
            }`}
          >
            {inferenceLocation === 'edge' ? 'EDGE AI' : 'SERVER AI'}
          </Badge>
        )}
        
        {isHikvisionFormat && (
          <Badge 
            variant="outline" 
            className="absolute top-2 left-2 text-[8px] bg-blue-500/80 text-white"
          >
            HIKVISION
          </Badge>
        )}
        
        {isLiveStream && (
          <Badge 
            variant="outline" 
            className="absolute top-2 left-2 ml-20 text-[8px] bg-green-500/80 text-white"
          >
            LIVE
          </Badge>
        )}
      </>
    );
  }

  return (
    <>
      <Button 
        variant="outline" 
        size="sm" 
        className="absolute bottom-4 right-4 bg-black/50 text-white hover:bg-black/70"
        onClick={onPlayPause}
      >
        {isPlaying ? <Pause size={18} /> : <Play size={18} />}
      </Button>
      
      {inferenceLocation && (
        <div className="absolute top-4 right-4 flex items-center gap-2">
          <Badge 
            variant="outline" 
            className={`${
              inferenceLocation === 'edge' 
                ? 'bg-green-500 text-white' 
                : 'bg-yellow-500 text-white'
            }`}
          >
            <Server className="mr-1 h-3 w-3" />
            {inferenceLocation === 'edge' ? 'EDGE AI' : 'SERVER AI'}
          </Badge>
          {inferenceTime && (
            <Badge variant="outline" className="bg-black/50 text-white">
              {inferenceTime.toFixed(1)} ms
            </Badge>
          )}
        </div>
      )}
      
      {isHikvisionFormat && (
        <Badge 
          variant="outline" 
          className="absolute top-4 left-4 bg-blue-500 text-white"
        >
          HIKVISION FORMAT
        </Badge>
      )}
      
      {isLiveStream && (
        <Badge 
          variant="outline" 
          className="absolute top-4 left-4 ml-8 bg-green-500 text-white"
        >
          LIVE STREAM
        </Badge>
      )}
    </>
  );
};
