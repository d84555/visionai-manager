import React from 'react';
import { Grid2X2, Grid3X3, MonitorPlay, Grid } from 'lucide-react';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';

interface CameraControlsProps {
  gridLayout: '1x1' | '2x2' | '3x3' | '4x4';
  onLayoutChange: (layout: '1x1' | '2x2' | '3x3' | '4x4') => void;
  streamType: 'main' | 'sub';
  onStreamTypeChange: (type: 'main' | 'sub') => void;
}

const CameraControls: React.FC<CameraControlsProps> = ({
  gridLayout,
  onLayoutChange,
  streamType,
  onStreamTypeChange
}) => {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <ToggleGroup type="single" value={gridLayout} onValueChange={(value) => {
        if (value) onLayoutChange(value as '1x1' | '2x2' | '3x3' | '4x4');
      }}>
        <ToggleGroupItem value="1x1" aria-label="Single view">
          <Grid className="h-4 w-4" />
        </ToggleGroupItem>
        <ToggleGroupItem value="2x2" aria-label="2x2 grid">
          <Grid2X2 className="h-4 w-4" />
        </ToggleGroupItem>
        <ToggleGroupItem value="3x3" aria-label="3x3 grid">
          <Grid3X3 className="h-4 w-4" />
        </ToggleGroupItem>
        <ToggleGroupItem value="4x4" aria-label="4x4 grid">
          <Grid2X2 className="h-4 w-4 transform rotate-180" />
        </ToggleGroupItem>
      </ToggleGroup>
      
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="ml-2">
            <MonitorPlay className="mr-2 h-4 w-4" />
            {streamType === 'main' ? 'Main Stream' : 'Sub Stream'}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Stream Type</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem 
            onClick={() => onStreamTypeChange('main')}
            className={streamType === 'main' ? 'bg-secondary' : ''}
          >
            Main Stream (High Quality)
          </DropdownMenuItem>
          <DropdownMenuItem 
            onClick={() => onStreamTypeChange('sub')}
            className={streamType === 'sub' ? 'bg-secondary' : ''}
          >
            Sub Stream (Low Bandwidth)
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};

export default CameraControls;
