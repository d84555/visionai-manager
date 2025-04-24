import React, { useState, useEffect } from 'react';
import { Camera as CameraIcon, RefreshCw, Settings, Layers, X } from 'lucide-react';
import { Camera } from '@/services/CameraService';
import CameraService from '@/services/CameraService';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import VideoFeed from '@/components/video/VideoFeed';
import { Badge } from '@/components/ui/badge';
import SettingsService from '@/services/SettingsService';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from 'sonner';

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
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeModel, setActiveModel] = useState<{ name: string; path: string } | undefined>(undefined);
  const [availableModels, setAvailableModels] = useState<{id: string, name: string, path: string}[]>([]);
  const [camerasWithCustomModel, setCamerasWithCustomModel] = useState<Record<string, { name: string; path: string }>>({});
  const [dragOverPosition, setDragOverPosition] = useState<string | null>(null);
  
  useEffect(() => {
    loadCameras();
    loadActiveModel();
    loadModels();
    loadCameraModels();
  }, []);
  
  const loadCameras = () => {
    const loadedCameras = CameraService.getAllCameras();
    setCameras(loadedCameras);
  };
  
  const loadActiveModel = () => {
    const model = SettingsService.getActiveModel();
    setActiveModel(model);
  };
  
  const loadModels = () => {
    const modelsList = [
      { id: 'yolov11-n', name: 'YOLOv11 Nano', path: '/models/yolov11-n.onnx' },
      { id: 'yolov11-s', name: 'YOLOv11 Small', path: '/models/yolov11-s.onnx' },
      { id: 'yolov11', name: 'YOLOv11 Base', path: '/models/yolov11.onnx' },
      { id: 'yolov11-m', name: 'YOLOv11 Medium', path: '/models/yolov11-m.onnx' },
      { id: 'yolov11-l', name: 'YOLOv11 Large', path: '/models/yolov11-l.onnx' }
    ];
    setAvailableModels(modelsList);
  };
  
  const loadCameraModels = () => {
    const savedCameraModels = localStorage.getItem('camera-models');
    if (savedCameraModels) {
      setCamerasWithCustomModel(JSON.parse(savedCameraModels));
    }
  };
  
  const saveCameraModels = (newCameraModels: Record<string, { name: string; path: string }>) => {
    localStorage.setItem('camera-models', JSON.stringify(newCameraModels));
    setCamerasWithCustomModel(newCameraModels);
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
  
  const handleApplyModelToCamera = (cameraId: string, modelId: string | null) => {
    const newCameraModels = { ...camerasWithCustomModel };
    
    if (modelId === null) {
      // Remove custom model
      delete newCameraModels[cameraId];
      saveCameraModels(newCameraModels);
      toast.success("Camera will use global AI model");
      return;
    }
    
    const model = availableModels.find(m => m.id === modelId);
    if (model) {
      newCameraModels[cameraId] = { name: model.name, path: model.path };
      saveCameraModels(newCameraModels);
      toast.success(`Applied ${model.name} to camera`);
    }
  };
  
  const handleApplyModelToAll = (modelId: string | null) => {
    if (modelId === null) {
      // Clear all custom models
      saveCameraModels({});
      toast.success("All cameras will use global AI model");
      return;
    }
    
    const model = availableModels.find(m => m.id === modelId);
    if (model) {
      const newCameraModels: Record<string, { name: string; path: string }> = {};
      cameras.forEach(camera => {
        newCameraModels[camera.id] = { name: model.name, path: model.path };
      });
      saveCameraModels(newCameraModels);
      toast.success(`Applied ${model.name} to all cameras`);
    }
  };
  
  const getCameraModel = (cameraId: string) => {
    // First check if camera has a custom model assigned
    if (camerasWithCustomModel[cameraId]) {
      return camerasWithCustomModel[cameraId];
    }
    // Otherwise use the global active model
    return activeModel;
  };
  
  const getAssignedCamera = (positionId: string) => {
    const cameraId = cameraAssignments[positionId];
    if (!cameraId) return null;
    
    return cameras.find(camera => camera.id === cameraId);
  };
  
  // Handler for drag over events
  const handleDragOver = (e: React.DragEvent, positionId: string) => {
    e.preventDefault();
    setDragOverPosition(positionId);
  };
  
  // Handler for drag leave events
  const handleDragLeave = () => {
    setDragOverPosition(null);
  };
  
  // Handler for drop events
  const handleDrop = (e: React.DragEvent, positionId: string) => {
    e.preventDefault();
    setDragOverPosition(null);
    
    const cameraId = e.dataTransfer.getData('text/plain');
    if (cameraId && cameraId.length > 0) {
      if (onClearAssignment) {
        onClearAssignment(positionId);
      }
      toast.success('Camera assigned to grid position');
    }
  };
  
  // Handler for context menu to clear assignment
  const handleContextMenu = (e: React.MouseEvent, positionId: string) => {
    e.preventDefault();
    
    if (onClearAssignment && cameraAssignments[positionId]) {
      onClearAssignment(positionId);
    }
  };
  
  const renderGridPositions = () => {
    const count = getCameraCount();
    const positions = [];
    
    for (let i = 0; i < count; i++) {
      const positionId = `position-${i}`;
      const assignedCamera = getAssignedCamera(positionId);
      
      positions.push(
        <Card 
          key={positionId} 
          className={`overflow-hidden ${
            dragOverPosition === positionId 
              ? 'ring-2 ring-avianet-red ring-opacity-70' 
              : ''
          }`}
          onDragOver={(e) => handleDragOver(e, positionId)}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, positionId)}
          onContextMenu={(e) => handleContextMenu(e, positionId)}
        >
          <CardHeader className="py-2 px-4 flex-row justify-between items-center bg-muted/30">
            <div className="flex items-center">
              <CameraIcon className="mr-2 h-4 w-4 text-avianet-red" />
              <span className="text-sm font-medium">
                {assignedCamera ? assignedCamera.name : `Grid Position ${i + 1}`}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {assignedCamera && (
                <>
                  <Badge
                    variant={assignedCamera.isOnline ? "default" : "outline"}
                    className={assignedCamera.isOnline ? "bg-green-500" : "text-red-500 border-red-500"}
                  >
                    {assignedCamera.isOnline ? "Online" : "Offline"}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => onClearAssignment && onClearAssignment(positionId)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </>
              )}
              {assignedCamera && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                      <Settings className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>AI Model</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => handleApplyModelToCamera(assignedCamera.id, null)}>
                      Use Global AI Model
                    </DropdownMenuItem>
                    {availableModels.map(model => (
                      <DropdownMenuItem 
                        key={model.id} 
                        onClick={() => handleApplyModelToCamera(assignedCamera.id, model.id)}
                        className={
                          camerasWithCustomModel[assignedCamera.id]?.path === model.path ? "bg-muted" : ""
                        }
                      >
                        {model.name}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {assignedCamera ? (
              <VideoFeed
                initialVideoUrl={CameraService.getPlayableStreamUrl(assignedCamera)}
                autoStart={assignedCamera.isOnline}
                showControls={false}
                camera={{
                  id: assignedCamera.id,
                  name: assignedCamera.name,
                  streamUrl: {
                    main: CameraService.getPlayableStreamUrl(assignedCamera),
                    sub: CameraService.getPlayableStreamUrl(assignedCamera)
                  }
                }}
                activeModel={getCameraModel(assignedCamera.id)}
              />
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
    }
    
    return positions;
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
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-medium">Camera Feeds</h3>
        <div className="flex gap-2">
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
              <DropdownMenuItem onClick={() => handleApplyModelToAll(null)}>
                Use Global AI Model
              </DropdownMenuItem>
              {availableModels.map(model => (
                <DropdownMenuItem key={model.id} onClick={() => handleApplyModelToAll(model.id)}>
                  {model.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          
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
      </div>
      
      <div className={`grid ${getGridClassName()} gap-4`}>
        {renderGridPositions()}
      </div>
    </div>
  );
};

export default CameraGrid;
