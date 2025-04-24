
import React from 'react';
import { Button } from '@/components/ui/button';

interface DemoVideoButtonsProps {
  onSelectDemo: (url: string) => void;
  isProcessing: boolean;
}

export const DemoVideoButtons: React.FC<DemoVideoButtonsProps> = ({ onSelectDemo, isProcessing }) => {
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={() => onSelectDemo('https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4')}
        className="text-xs"
        disabled={isProcessing}
      >
        Demo Video 1
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => onSelectDemo('https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4')}
        className="text-xs"
        disabled={isProcessing}
      >
        Demo Video 2
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => onSelectDemo('https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4')}
        className="text-xs"
        disabled={isProcessing}
      >
        Demo Video 3
      </Button>
    </div>
  );
};
