
import React, { useState } from 'react';
import { Camera } from '@/services/CameraService';
import { Card, CardContent } from '@/components/ui/card';
import { Grip, Video, Camera as CameraIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';

interface CameraListPanelProps {
  cameras: Camera[];
  onAssignCamera: (cameraId: string, gridPositionId: string) => void;
  gridLayout: '1x1' | '2x2' | '3x3' | '4x4';
}

const CameraListPanel: React.FC<CameraListPanelProps> = ({ 
  cameras, 
  onAssignCamera, 
  gridLayout 
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [draggedCameraId, setDraggedCameraId] = useState<string | null>(null);
  
  // FIX: Improved drag start handler to ensure data is properly set
  const handleDragStart = (cameraId: string, e: React.DragEvent) => {
    setDraggedCameraId(cameraId);
    
    // Set the data that will be transferred - make sure it's properly set
    e.dataTransfer.setData('text/plain', cameraId);
    e.dataTransfer.effectAllowed = 'copy';
    
    // Custom styling for the drag image (optional)
    const dragImage = document.createElement('div');
    dragImage.innerHTML = `<div class="p-2 bg-primary text-white rounded">Camera</div>`;
    dragImage.style.position = 'absolute';
    dragImage.style.top = '-1000px';
    document.body.appendChild(dragImage);
    e.dataTransfer.setDragImage(dragImage, 0, 0);
    
    // Cleanup the drag image element after drag ends
    setTimeout(() => {
      document.body.removeChild(dragImage);
    }, 0);
  };
  
  const handleDragEnd = () => {
    setDraggedCameraId(null);
  };
  
  const getGridPositionCount = () => {
    switch (gridLayout) {
      case '1x1': return 1;
      case '2x2': return 4;
      case '3x3': return 9;
      case '4x4': return 16;
      default: return 4;
    }
  };
  
  // Filter cameras based on search term
  const filteredCameras = cameras.filter(camera => 
    camera.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="h-full flex flex-col">
      <div className="mb-4">
        <h3 className="text-lg font-medium mb-2">Available Cameras</h3>
        <Input
          type="text"
          placeholder="Search cameras..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full"
        />
        <p className="text-xs text-muted-foreground mt-2">
          Drag cameras to grid positions to assign them
        </p>
      </div>
      
      <ScrollArea className="flex-grow">
        <div className="space-y-2 pr-4">
          {filteredCameras.length === 0 ? (
            <div className="text-center p-4 text-muted-foreground">
              No cameras found matching "{searchTerm}"
            </div>
          ) : (
            filteredCameras.map(camera => (
              <Card 
                key={camera.id}
                className={`cursor-grab transition-all ${
                  draggedCameraId === camera.id ? 'opacity-50' : ''
                }`}
                draggable
                onDragStart={(e) => handleDragStart(camera.id, e)}
                onDragEnd={handleDragEnd}
              >
                <CardContent className="p-3 flex items-center">
                  <div className="mr-2">
                    <Grip className="h-4 w-4 text-muted-foreground" />
                  </div>
                  
                  <div className="flex-grow">
                    <div className="flex items-center">
                      <CameraIcon className="h-4 w-4 text-avianet-red mr-1" />
                      <span className="font-medium text-sm">{camera.name}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {camera.ipAddress}:{camera.port}
                    </div>
                  </div>
                  
                  <Badge
                    variant={camera.isOnline ? "default" : "outline"}
                    className={camera.isOnline ? "bg-green-500" : "text-red-500 border-red-500"}
                  >
                    {camera.isOnline ? "Online" : "Offline"}
                  </Badge>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </ScrollArea>
      
      <div className="mt-4 bg-muted p-3 rounded-md">
        <h4 className="text-sm font-medium mb-2">Grid Layout Help</h4>
        <p className="text-xs text-muted-foreground">
          Current layout: {gridLayout} ({getGridPositionCount()} positions)
        </p>
        <ul className="text-xs text-muted-foreground mt-2 list-disc list-inside">
          <li>Drag cameras to assign them</li>
          <li>Change layout using controls above</li>
          <li>Right-click in grid to remove camera</li>
        </ul>
      </div>
    </div>
  );
};

export default CameraListPanel;
