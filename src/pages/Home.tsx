import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Video, Bell, FileText, Brain, Settings, Server, Cpu, Grid, Grip } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import CameraGrid from '@/components/camera/CameraGrid';
import CameraControls from '@/components/video/CameraControls';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import AIModelUpload from '@/components/ai/AIModelUpload';
import SettingsService from '@/services/SettingsService';
import CameraService from '@/services/CameraService';
import { Camera } from '@/services/CameraService';
import { toast } from 'sonner';
import CameraListPanel from '@/components/camera/CameraListPanel';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';

const Home = () => {
  const [gridLayout, setGridLayout] = useState<'1x1' | '2x2' | '3x3' | '4x4'>('1x1');
  const [streamType, setStreamType] = useState<'main' | 'sub'>('main');
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [cameraAssignments, setCameraAssignments] = useState<Record<string, string>>({});
  const [showCameraPanel, setShowCameraPanel] = useState(true);
  
  useEffect(() => {
    const savedLayout = SettingsService.getGridLayout();
    if (savedLayout) {
      setGridLayout(savedLayout.layout);
      setStreamType(savedLayout.streamType);
    }
    
    const savedAssignments = localStorage.getItem('camera-grid-assignments');
    if (savedAssignments) {
      setCameraAssignments(JSON.parse(savedAssignments));
    }
    
    const loadedCameras = CameraService.getAllCameras();
    setCameras(loadedCameras);
  }, []);
  
  useEffect(() => {
    SettingsService.saveGridLayout({
      layout: gridLayout,
      streamType: streamType
    });
  }, [gridLayout, streamType]);
  
  useEffect(() => {
    localStorage.setItem('camera-grid-assignments', JSON.stringify(cameraAssignments));
  }, [cameraAssignments]);
  
  const handleAssignCamera = (cameraId: string, gridPositionId: string) => {
    const newAssignments = { ...cameraAssignments };
    newAssignments[gridPositionId] = cameraId;
    setCameraAssignments(newAssignments);
    toast.success('Camera assigned to grid position', {
      description: 'Your grid layout will be saved automatically'
    });
  };
  
  const handleClearAssignment = (gridPositionId: string) => {
    const newAssignments = { ...cameraAssignments };
    delete newAssignments[gridPositionId];
    setCameraAssignments(newAssignments);
    toast.info('Camera removed from grid position');
  };
  
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
      
      <div className="bg-card rounded-md border shadow-sm">
        <Tabs defaultValue="multicamera" className="w-full">
          <div className="flex items-center justify-between border-b px-4 py-2">
            <TabsList>
              <TabsTrigger value="multicamera">Multi-Camera View</TabsTrigger>
              <TabsTrigger value="aimodels">AI Models</TabsTrigger>
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
            <div className="flex gap-4">
              <div className={`flex-grow transition-all ${showCameraPanel ? 'w-3/4' : 'w-full'}`}>
                <CameraGrid 
                  layout={gridLayout} 
                  cameraAssignments={cameraAssignments}
                  onClearAssignment={handleClearAssignment}
                />
              </div>
              
              {showCameraPanel && (
                <div className="w-1/4 border-l pl-4">
                  <CameraListPanel 
                    cameras={cameras} 
                    onAssignCamera={handleAssignCamera}
                    gridLayout={gridLayout}
                  />
                </div>
              )}
            </div>
          </TabsContent>
          
          <TabsContent value="aimodels" className="p-4">
            <AIModelUpload />
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
      
      <div className="text-center p-4 text-sm text-muted-foreground border-t mt-6">
        <p>Avianet Vision • Version 1.0.0 • Powered by YOLOv11</p>
      </div>
    </div>
  );
};

import { Button } from '@/components/ui/button';

export default Home;
