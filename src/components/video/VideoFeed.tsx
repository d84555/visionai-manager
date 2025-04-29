import React, { useState, useEffect } from 'react';
import { AlertTriangle, Camera, VideoIcon, Loader, Server } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useVideoFeed } from '@/hooks/useVideoFeed';
import { VideoControls } from './VideoControls';
import { CanvasDetectionOverlay } from './CanvasDetectionOverlay';
import { ModelSelector } from './ModelSelector';
import { DemoVideoButtons } from './DemoVideoButtons';
import SettingsService from '@/services/SettingsService';
import StorageServiceFactory from '@/services/storage/StorageServiceFactory';
import { toast } from 'sonner';

interface VideoFeedProps {
  initialVideoUrl?: string;
  autoStart?: boolean;
  showControls?: boolean;
  camera?: {
    id: string;
    name: string;
    streamUrl: {
      main: string;
      sub: string;
    };
  };
  isPinned?: boolean;
  onPinToggle?: () => void;
  activeModels?: { name: string; path: string }[];
  streamType?: 'main' | 'sub';
  fps?: number;
}

const VideoFeed: React.FC<VideoFeedProps> = ({ 
  initialVideoUrl = '', 
  autoStart = false,
  showControls = true,
  camera,
  isPinned = false,
  onPinToggle,
  activeModels = [],
  streamType = 'main',
  fps = 10
}) => {
  const [selectedModels, setSelectedModels] = useState<{name: string; path: string}[]>([]);
  const [availableModels, setAvailableModels] = useState<{id: string, name: string, path: string}[]>([]);

  useEffect(() => {
    const loadModels = async () => {
      try {
        const storageService = StorageServiceFactory.getService();
        const customModels = await storageService.listModels();
        
        const formattedCustomModels = customModels.map(model => ({
          id: model.id,
          name: model.name,
          path: model.path
        }));
        
        setAvailableModels(formattedCustomModels);
        
        // Get saved active models
        try {
          const savedModels = await storageService.getActiveModels();
          if (savedModels && savedModels.length > 0) {
            setSelectedModels(savedModels);
          } else if (activeModels && activeModels.length > 0) {
            setSelectedModels(activeModels);
          }
        } catch (error) {
          console.error('Failed to load active models:', error);
          // If there's an error getting active models, try to use the provided activeModels
          if (activeModels && activeModels.length > 0) {
            setSelectedModels(activeModels);
          }
        }
      } catch (error) {
        console.error('Failed to load models:', error);
        toast.error('Failed to load models from the Edge Computing node');
      }
    };
    
    loadModels();
  }, [activeModels]);

  const {
    videoUrl,
    setVideoUrl,
    isStreaming,
    isPlaying,
    detections,
    resolution,
    isProcessing,
    hasUploadedFile,
    inferenceLocation,
    inferenceTime,
    actualFps,
    isHikvisionFormat,
    setIsHikvisionFormat,
    isModelLoading,
    videoRef,
    containerRef,
    startStream,
    stopStream,
    togglePlayPause,
    handleFileUpload,
    handleVideoMetadata,
    handleVideoError,
    setHasUploadedFile,
    setOriginalFile
  } = useVideoFeed({
    initialVideoUrl,
    autoStart,
    camera,
    activeModels: selectedModels,
    streamType,
    fps
  });

  const handleModelChange = async (modelIds: string[]) => {
    const models = modelIds.map(id => {
      const model = availableModels.find(m => m.id === id);
      return model ? { name: model.name, path: model.path } : null;
    }).filter((m): m is { name: string; path: string } => m !== null);
    
    setSelectedModels(models);
    
    try {
      const storageService = StorageServiceFactory.getService();
      await storageService.setActiveModels(models);
      
      if (models.length === 0) {
        toast.info('All detection models have been removed');
      } else if (models.length === 1) {
        toast.success(`Model "${models[0].name}" set as active`);
      } else {
        toast.success(`${models.length} models selected for detection`);
      }
    } catch (error) {
      console.error('Failed to save active models:', error);
      toast.error('Failed to save model selection');
    }
  };

  const handleDemoVideo = (url: string) => {
    setVideoUrl(url);
    setHasUploadedFile(false);
    setOriginalFile(null);
    setIsHikvisionFormat(false);
    if (isStreaming) {
      stopStream();
    }
  };

  if (!showControls) {
    return (
      <div className="video-feed relative" ref={containerRef}>
        {isProcessing || isModelLoading ? (
          <div className="flex flex-col items-center justify-center bg-gray-100 dark:bg-gray-800 rounded-md" style={{ height: '160px' }}>
            <Loader className="text-avianet-red animate-spin" size={24} />
            <p className="text-sm mt-2 text-gray-500">
              {isModelLoading ? 'Loading AI model...' : 'Processing video...'}
            </p>
          </div>
        ) : isStreaming ? (
          <div className="relative w-full h-full">
            <video
              ref={videoRef}
              src={camera?.streamUrl ? camera.streamUrl[streamType] : videoUrl}
              width="100%"
              height="auto"
              onLoadedMetadata={handleVideoMetadata}
              onError={handleVideoError}
              autoPlay
              muted
              loop
              playsInline
              className="w-full max-h-[200px] object-cover"
            />
            
            <div className="absolute inset-0 pointer-events-none">
              <CanvasDetectionOverlay 
                detections={detections} 
                videoRef={videoRef}
                minimal 
              />
            </div>
            
            <VideoControls
              isPlaying={isPlaying}
              isPinned={isPinned}
              onPinToggle={onPinToggle}
              onPlayPause={togglePlayPause}
              inferenceLocation={inferenceLocation}
              isHikvisionFormat={isHikvisionFormat}
              showMinimalControls
            />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center bg-gray-100 dark:bg-gray-800 rounded-md" style={{ height: '160px' }}>
            <VideoIcon className="text-gray-400" size={24} />
          </div>
        )}
      </div>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader className="border-b">
        <CardTitle className="flex items-center">
          <Camera className="mr-2 text-avianet-red" size={20} />
          Real-time Video Feed
          {isHikvisionFormat && (
            <Badge variant="outline" className="ml-2 bg-blue-500 text-white">
              HIKVISION
            </Badge>
          )}
          {actualFps !== null && (
            <Badge variant="outline" className="ml-2">
              {actualFps} FPS
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-6">
        <div className="space-y-4">
          {/* Model selection - placed at the top */}
          <ModelSelector
            selectedModels={selectedModels}
            availableModels={availableModels}
            onModelChange={handleModelChange}
          />

          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <Label htmlFor="video-url">Video Stream URL</Label>
              <div className="flex mt-1">
                <Input
                  id="video-url"
                  placeholder="Enter video URL..."
                  value={videoUrl}
                  onChange={(e) => {
                    setVideoUrl(e.target.value);
                    setHasUploadedFile(false);
                    setOriginalFile(null);
                  }}
                  className="rounded-r-none"
                  disabled={hasUploadedFile || isProcessing}
                />
                <Button
                  variant={isStreaming ? "destructive" : "default"}
                  onClick={isStreaming ? stopStream : startStream}
                  className="rounded-l-none"
                  disabled={isProcessing || isModelLoading || (!videoUrl && !hasUploadedFile)}
                >
                  {isStreaming ? "Stop" : "Start"}
                </Button>
              </div>
              {hasUploadedFile && (
                <p className="text-xs text-muted-foreground mt-1">
                  {isProcessing ? 'Processing video file...' : (
                    isHikvisionFormat ? 'Hikvision format detected. Click Start to begin.' : 'Local file loaded. Click Start to begin.'
                  )}
                </p>
              )}
            </div>
          </div>
          
          <div className="flex flex-wrap gap-2 items-center">
            <div className="flex-1">
              <Label htmlFor="video-file">Or upload a local video file:</Label>
              <Input
                id="video-file"
                type="file"
                accept="video/*,.dav"
                onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
                className="mt-1"
                disabled={isProcessing || isModelLoading}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Supports MP4, WebM, Hikvision DAV, and other NVR export formats
              </p>
            </div>
          </div>

          <DemoVideoButtons
            onSelectDemo={handleDemoVideo}
            isProcessing={isProcessing || isModelLoading}
          />

          <div className="video-feed mt-4 relative" ref={containerRef}>
            {isProcessing ? (
              <div className="flex flex-col items-center justify-center bg-gray-100 dark:bg-gray-800 rounded-md" style={{ height: '360px' }}>
                <Loader className="text-avianet-red animate-spin mb-2" size={48} />
                <p className="text-gray-700 dark:text-gray-300">Processing video...</p>
                <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">This may take a moment depending on the file size</p>
              </div>
            ) : isModelLoading ? (
              <div className="flex flex-col items-center justify-center bg-gray-100 dark:bg-gray-800 rounded-md" style={{ height: '360px' }}>
                <Loader className="text-avianet-red animate-spin mb-2" size={48} />
                <p className="text-gray-700 dark:text-gray-300">Loading AI model...</p>
                <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">This may take a moment for custom models</p>
              </div>
            ) : isStreaming ? (
              <div className="relative">
                <video
                  ref={videoRef}
                  src={camera?.streamUrl ? camera.streamUrl[streamType] : videoUrl}
                  width={resolution.width}
                  height={resolution.height}
                  onLoadedMetadata={handleVideoMetadata}
                  onError={handleVideoError}
                  autoPlay
                  muted
                  loop
                  playsInline
                  className="w-full"
                />
                
                <div className="absolute inset-0 pointer-events-none">
                  <CanvasDetectionOverlay detections={detections} videoRef={videoRef} />
                </div>
                
                <VideoControls
                  isPlaying={isPlaying}
                  onPlayPause={togglePlayPause}
                  inferenceLocation={inferenceLocation}
                  inferenceTime={inferenceTime}
                  isHikvisionFormat={isHikvisionFormat}
                />
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center bg-gray-100 dark:bg-gray-800 rounded-md" style={{ height: '360px' }}>
                <VideoIcon className="text-gray-400 mb-2" size={48} />
                <p className="text-gray-500 dark:text-gray-400">No video stream active</p>
                <p className="text-gray-400 dark:text-gray-500 text-sm mt-1">Enter a URL or upload a file and click Start to begin</p>
              </div>
            )}
          </div>
          
          {isStreaming && detections.length === 0 && selectedModels.length === 0 && (
            <div className="flex items-center justify-center p-4 bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400 rounded-md">
              <AlertTriangle className="mr-2" size={16} />
              <span className="text-sm">No AI models selected. Select one or more models to enable object detection.</span>
            </div>
          )}
          
          {isStreaming && detections.length === 0 && selectedModels.length > 0 && (
            <div className="flex items-center justify-center p-4 bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400 rounded-md">
              <AlertTriangle className="mr-2" size={16} />
              <span className="text-sm">Running object detection...</span>
            </div>
          )}
          
          {isStreaming && inferenceLocation && (
            <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800/50 border rounded-md">
              <div className="flex items-center">
                <Server className="mr-2 text-avianet-red" size={18} />
                <div>
                  <p className="text-sm font-medium">
                    {inferenceLocation === 'edge' 
                      ? 'Edge Computing Active' 
                      : 'Server Processing Active'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {inferenceLocation === 'edge'
                      ? 'AI processing on edge device for reduced latency'
                      : 'Fallback to server processing due to edge unavailability'}
                  </p>
                </div>
              </div>
              <div className="text-right flex flex-col">
                <p className="text-sm font-medium">Inference Stats</p>
                <div className="flex gap-2 items-center">
                  {inferenceTime && (
                    <p className={`text-sm ${inferenceLocation === 'edge' ? 'text-green-600 dark:text-green-400' : 'text-yellow-600 dark:text-yellow-400'}`}>
                      {inferenceTime.toFixed(1)} ms
                    </p>
                  )}
                  {actualFps !== null && (
                    <Badge variant="outline" className="text-xs py-0">
                      {actualFps} FPS
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          )}
          
          <div className="text-xs text-gray-500 mt-2 p-3 border border-gray-200 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-gray-800/30">
            <p className="font-medium mb-1">Storage Directory Information:</p>
            <ul className="list-disc pl-5">
              <li>Models directory: {SettingsService.localStorageConfig.modelsPath}</li>
              <li>Settings directory: {SettingsService.localStorageConfig.settingsPath}</li>
              <li>Note: In browser environment, these paths are simulated</li>
              <li>For true filesystem persistence, an Electron or Node.js implementation is required</li>
            </ul>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default VideoFeed;
