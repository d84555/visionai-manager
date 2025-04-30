import React, { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { VideoIcon, Camera, Layers, Cpu } from 'lucide-react';
import VideoFeed from '@/components/video/VideoFeed';
import CameraManagement from '@/components/camera/CameraManagement';
import CameraGrid from '@/components/camera/CameraGrid';
import ModelSelector from '@/components/ai/ModelSelector';
import SettingsService from '@/services/SettingsService';
import CameraService from '@/services/CameraService';
import CameraListPanel from '@/components/camera/CameraListPanel';
import CameraControls from '@/components/video/CameraControls';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import StorageServiceFactory from '@/services/storage/StorageServiceFactory';
import { toast } from 'sonner';

const VideoPage = () => {
  const [refreshKey, setRefreshKey] = useState(0);
  const [activeModels, setActiveModels] = useState<{ name: string; path: string }[]>([]);
  const [gridLayout, setGridLayout] = useState<'1x1' | '2x2' | '3x3' | '4x4'>('2x2');
  const [streamType, setStreamType] = useState<'main' | 'sub'>('main');
  const [cameraAssignments, setCameraAssignments] = useState<Record<string, string>>({});
  const [showCameraPanel, setShowCameraPanel] = useState(true);
  const [cameras, setCameras] = useState([]);
  const [availableModels, setAvailableModels] = useState<{id: string; name: string; path: string}[]>([]);

  useEffect(() => {
    const loadSavedSettings = async () => {
      try {
        // Get saved active models
        const savedModels = SettingsService.getActiveModels();
        if (savedModels && savedModels.length > 0) {
          setActiveModels(savedModels);
        }
        
        // Get saved layout settings
        const savedLayout = SettingsService.getGridLayout();
        if (savedLayout) {
          setGridLayout(savedLayout.layout);
          setStreamType(savedLayout.streamType);
        }
        
        // Get saved camera assignments
        const savedAssignments = localStorage.getItem('camera-grid-assignments');
        if (savedAssignments) {
          setCameraAssignments(JSON.parse(savedAssignments));
        }
      } catch (error) {
        console.error('Error loading saved settings:', error);
      }
    };
    
    loadSavedSettings();
    loadCameras();
    loadModels();
  }, []);
  
  const loadCameras = () => {
    const loadedCameras = CameraService.getAllCameras();
    setCameras(loadedCameras);
  };
  
  const loadModels = async () => {
    try {
      const storageService = StorageServiceFactory.getService();
      const models = await storageService.listModels();
      
      const formattedModels = models.map(model => ({
        id: model.id,
        name: model.name,
        path: model.path
      }));
      
      setAvailableModels(formattedModels);
      
      // Also try to get the active models
      try {
        const activeModels = await storageService.getActiveModels();
        if (activeModels && activeModels.length > 0) {
          setActiveModels(activeModels);
          SettingsService.setActiveModels(activeModels);
        }
      } catch (error) {
        console.warn('Failed to load active models, using cached if available');
      }
    } catch (error) {
      console.error('Failed to load models:', error);
      toast.error('Failed to load models from the server');
    }
  };

  useEffect(() => {
    SettingsService.saveGridLayout({
      layout: gridLayout,
      streamType: streamType
    });
  }, [gridLayout, streamType]);

  useEffect(() => {
    localStorage.setItem('camera-grid-assignments', JSON.stringify(cameraAssignments));
  }, [cameraAssignments]);

  const handleCamerasChanged = () => {
    loadCameras();
    setRefreshKey(prev => prev + 1);
  };

  const handleModelSelected = (modelName: string, modelPath: string) => {
    const newActiveModels = [{ name: modelName, path: modelPath }];
    setActiveModels(newActiveModels);
    SettingsService.setActiveModels(newActiveModels);
    setRefreshKey(prev => prev + 1);
  };
  
  const handleModelChange = (modelIds: string[]) => {
    const selectedModels = modelIds.map(id => {
      const model = availableModels.find(m => m.id === id);
      return model ? { name: model.name, path: model.path } : null;
    }).filter((m): m is { name: string; path: string } => m !== null);
    
    setActiveModels(selectedModels);
    SettingsService.setActiveModels(selectedModels);
    
    // Also set as active in the backend
    const storageService = StorageServiceFactory.getService();
    storageService.setActiveModels(selectedModels)
      .then(() => {
        if (selectedModels.length === 0) {
          toast.info('All detection models have been removed');
        } else if (selectedModels.length === 1) {
          toast.success(`Model ${selectedModels[0].name} set as active`);
        } else {
          toast.success(`${selectedModels.length} models set as active`);
        }
        setRefreshKey(prev => prev + 1);
      })
      .catch(error => {
        console.error('Failed to set active models:', error);
        toast.error('Failed to set active models');
      });
  };

  const handleAssignCamera = (cameraId: string, gridPositionId: string) => {
    const newAssignments = { ...cameraAssignments };
    newAssignments[gridPositionId] = cameraId;
    setCameraAssignments(newAssignments);
    
    localStorage.setItem('camera-grid-assignments', JSON.stringify(newAssignments));
  };

  const handleClearAssignment = (gridPositionId: string) => {
    const newAssignments = { ...cameraAssignments };
    delete newAssignments[gridPositionId];
    setCameraAssignments(newAssignments);
    
    localStorage.setItem('camera-grid-assignments', JSON.stringify(newAssignments));
  };

  // Fix for duplicate key warnings - use completely unique keys
  const gridKey = `grid-${refreshKey}-${crypto.randomUUID?.() || Math.random().toString(36)}`;
  const videoFeedKey = `videofeed-${refreshKey}-${crypto.randomUUID?.() || Math.random().toString(36)}`;
  
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Video Management</h1>
      </div>
      
      <Tabs defaultValue="stream">
        <TabsList className="mb-4">
          <TabsTrigger value="stream">
            <VideoIcon className="mr-2 h-4 w-4" />
            Single Stream
          </TabsTrigger>
          <TabsTrigger value="cameras">
            <Camera className="mr-2 h-4 w-4" />
            Camera Management
          </TabsTrigger>
          <TabsTrigger value="grid">
            <VideoIcon className="mr-2 h-4 w-4" />
            Camera Grid
          </TabsTrigger>
          <TabsTrigger value="models">
            <Layers className="mr-2 h-4 w-4" />
            AI Models
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="stream">
          <VideoFeed key={videoFeedKey} activeModels={activeModels} />
        </TabsContent>
        
        <TabsContent value="cameras">
          <CameraManagement onCamerasChanged={handleCamerasChanged} />
        </TabsContent>
        
        <TabsContent value="grid">
          <div key={gridKey} className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold">Camera Grid</h2>
              <CameraControls 
                gridLayout={gridLayout}
                onLayoutChange={setGridLayout}
                streamType={streamType}
                onStreamTypeChange={setStreamType}
              />
            </div>
            
            <ResizablePanelGroup direction="horizontal" className="min-h-[400px]">
              <ResizablePanel defaultSize={75} minSize={30}>
                <div className="h-full">
                  <CameraGrid 
                    layout={gridLayout}
                    cameraAssignments={cameraAssignments}
                    onClearAssignment={handleClearAssignment}
                  />
                </div>
              </ResizablePanel>
              
              {showCameraPanel && (
                <>
                  <ResizableHandle withHandle />
                  <ResizablePanel defaultSize={25} minSize={20}>
                    <div className="h-full border-l pl-4">
                      <CameraListPanel
                        cameras={cameras}  
                        onAssignCamera={handleAssignCamera}
                        gridLayout={gridLayout}
                      />
                    </div>
                  </ResizablePanel>
                </>
              )}
            </ResizablePanelGroup>
          </div>
        </TabsContent>
        
        <TabsContent value="models">
          <div className="max-w-3xl mx-auto">
            <Card className="mb-6">
              <CardHeader>
                <CardTitle>AI Model Management</CardTitle>
                <CardDescription>
                  Configure and manage AI models used for object detection across all video feeds
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-6">
                  Select AI models to use for object detection on video feeds. You can apply multiple models to detect different objects simultaneously.
                </p>
                
                <ModelSelector onModelSelected={handleModelSelected} />
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="border rounded-md p-4">
          <h2 className="text-lg font-medium mb-2">Video Stream Usage</h2>
          <p className="text-sm text-muted-foreground mb-4">
            The video stream displays real-time or recorded footage with AI-powered object detection overlays. Multiple models can be selected to detect different types of objects.
          </p>
          <h3 className="text-md font-medium mb-1">Instructions:</h3>
          <ol className="list-decimal list-inside text-sm text-muted-foreground space-y-1 ml-2">
            <li>Select one or more detection models from the dropdown</li>
            <li>Enter a valid video stream URL in the input field</li>
            <li>Or upload a local video file from your device</li>
            <li>Click the "Start" button to begin streaming and object detection</li>
            <li>Object detection results appear as overlays on the video</li>
          </ol>
        </div>
        
        <div className="border rounded-md p-4">
          <h2 className="text-lg font-medium mb-2">Detection Settings</h2>
          <p className="text-sm text-muted-foreground mb-3">
            The default detection settings work for most scenarios. For advanced configuration, visit the Settings page.
          </p>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Detection threshold:</span>
              <span className="font-medium">70%</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>Processing resolution:</span>
              <span className="font-medium">640x360</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>Detection frequency:</span>
              <span className="font-medium">Every 3 seconds</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>Active Models:</span>
              <span className="font-medium">{activeModels.length > 0 ? activeModels.map(m => m.name).join(', ') : "None"}</span>
            </div>
          </div>
        </div>
        
        <div className="border rounded-md p-4">
          <h2 className="flex items-center text-lg font-medium mb-2">
            <Cpu className="mr-2 text-avianet-red" size={18} />
            FFmpeg Encoding
          </h2>
          <p className="text-sm text-muted-foreground mb-3">
            The system includes an integrated FFmpeg encoder to support a wide range of video formats that may not be natively playable in browsers.
          </p>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Encoder:</span>
              <span className="font-medium">FFmpeg.wasm</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>Output format:</span>
              <span className="font-medium">MP4 (H.264)</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>Processing:</span>
              <span className="font-medium">Client-side</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>Supported inputs:</span>
              <span className="font-medium">Most video formats</span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Note: Processing large video files may take some time as encoding happens in your browser.
          </p>
        </div>
      </div>
    </div>
  );
};

export default VideoPage;
