import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Video, Bell, FileText, Brain, Settings, Server, Cpu, Grid, Grip } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import CameraGrid from '@/components/camera/CameraGrid';
import CameraControls from '@/components/video/CameraControls';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import SettingsService from '@/services/SettingsService';
import CameraService from '@/services/CameraService';
import { Camera } from '@/services/CameraService';
import { toast } from 'sonner';
import CameraListPanel from '@/components/camera/CameraListPanel';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { Button } from '@/components/ui/button';

const Home = () => {
  const [gridLayout, setGridLayout] = useState<'1x1' | '2x2' | '3x3' | '4x4'>('1x1');
  const [streamType, setStreamType] = useState<'main' | 'sub'>('main');
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [cameraAssignments, setCameraAssignments] = useState<Record<string, string>>({});
  const [showCameraPanel, setShowCameraPanel] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const savedLayout = SettingsService.getGridLayout();
    if (savedLayout) {
      setGridLayout(savedLayout.layout);
      setStreamType(savedLayout.streamType);
    }
    
    loadCameraAssignments();
    loadCameras();
  }, []);
  
  const loadCameras = () => {
    const loadedCameras = CameraService.getAllCameras();
    setCameras(loadedCameras);
  };
  
  const loadCameraAssignments = () => {
    const savedAssignments = localStorage.getItem('camera-grid-assignments');
    if (savedAssignments) {
      setCameraAssignments(JSON.parse(savedAssignments));
    }
  };
  
  useEffect(() => {
    SettingsService.saveGridLayout({
      layout: gridLayout,
      streamType: streamType
    });
  }, [gridLayout, streamType]);
  
  const handleAssignCamera = useCallback((cameraId: string, gridPositionId: string) => {
    console.log(`Assigning camera ${cameraId} to position ${gridPositionId}`);
    const newAssignments = { ...cameraAssignments };
    newAssignments[gridPositionId] = cameraId;
    setCameraAssignments(newAssignments);
    
    localStorage.setItem('camera-grid-assignments', JSON.stringify(newAssignments));
    
    setRefreshKey(prev => prev + 1);
    
    toast.success('Camera assigned to grid position', {
      description: 'Your grid layout will be saved automatically'
    });
  }, [cameraAssignments]);
  
  const handleClearAssignment = useCallback((gridPositionId: string) => {
    const newAssignments = { ...cameraAssignments };
    delete newAssignments[gridPositionId];
    setCameraAssignments(newAssignments);
    
    localStorage.setItem('camera-grid-assignments', JSON.stringify(newAssignments));
    
    setRefreshKey(prev => prev + 1);
    
    toast.info('Camera removed from grid position');
  }, [cameraAssignments]);
  
  const features = [
    {
      icon: <Video size={20} />,
      title: 'Real-time Video Display',
      description: 'Display the live video stream with overlays of detected objects using YOLOv11 model.',
      link: '/video'
    },
    {
      icon: <Bell size={20} />,
      title: 'Alert Dashboard',
      description: 'View alerts showing timestamps, event IDs, and detected objects in a tabular format.',
      link: '/alerts'
    },
    {
      icon: <FileText size={20} />,
      title: 'Event Logging',
      description: 'Categorize and store events in a log, with filtering by timestamp, object, or event ID.',
      link: '/events'
    },
    {
      icon: <Brain size={20} />,
      title: 'AI-Powered Insights',
      description: 'Analyze and summarize event logs, providing insights into patterns or anomalies.',
      link: '/insights'
    },
    {
      icon: <Cpu size={20} />,
      title: 'Edge Computing',
      description: 'Deploy and manage AI models on edge devices for reduced latency and bandwidth usage.',
      link: '/edge'
    },
    {
      icon: <Settings size={20} />,
      title: 'Settings',
      description: 'Configure application preferences, video sources, and detection parameters.',
      link: '/settings'
    }
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Welcome to Avianet Vision</h1>
      </div>
      
      <style>{`
        #camera-grid:fullscreen {
          background: black;
          padding: 20px;
          overflow-y: auto;
        }
        
        #camera-grid:fullscreen .card {
          height: auto;
        }
        
        #camera-grid:fullscreen video {
          width: 100%;
          object-fit: contain;
        }
        
        .fullscreen-container video {
          width: 100%;
          height: 100vh;
          object-fit: contain;
          background: black;
        }
      `}</style>
      
      <div className="bg-card rounded-md border shadow-sm">
        <Tabs defaultValue="multicamera" className="w-full">
          <div className="flex items-center justify-between border-b px-4 py-2">
            <TabsList>
              <TabsTrigger value="multicamera">Multi-Camera View</TabsTrigger>
            </TabsList>
            
            <div className="flex items-center space-x-2">
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => setShowCameraPanel(!showCameraPanel)}
                className="flex items-center gap-1"
              >
                <Grid className="h-4 w-4" />
                {showCameraPanel ? 'Hide Camera Panel' : 'Show Camera Panel'}
              </Button>
              
              <CameraControls 
                gridLayout={gridLayout} 
                onLayoutChange={(layout) => {
                  setGridLayout(layout);
                  toast.success(`Grid layout changed to ${layout}`);
                }}
                streamType={streamType}
                onStreamTypeChange={(type) => {
                  setStreamType(type);
                  toast.success(`Stream type changed to ${type}`);
                }}
              />
            </div>
          </div>
          
          <TabsContent value="multicamera" className="p-4">
            <ResizablePanelGroup direction="horizontal" className="min-h-[400px]">
              <ResizablePanel defaultSize={75} minSize={30}>
                <div className="h-full">
                  <CameraGrid 
                    key={refreshKey}
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
          </TabsContent>
        </Tabs>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {features.map((feature, index) => (
          <Card key={index} className="overflow-hidden">
            <Link to={feature.link} className="block h-full">
              <CardHeader className="border-b bg-secondary/50">
                <CardTitle className="flex items-center text-base font-medium">
                  <span className="bg-avianet-red text-white p-1.5 rounded-md mr-2">
                    {feature.icon}
                  </span>
                  {feature.title}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">{feature.description}</p>
              </CardContent>
            </Link>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default Home;
