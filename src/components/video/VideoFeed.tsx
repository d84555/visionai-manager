import React, { useState, useEffect } from 'react';
import { AlertTriangle, Camera, VideoIcon, Loader, Server, FileVideo, Network, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useVideoFeed } from '@/hooks/useVideoFeed';
import { useHLSPlayer } from '@/hooks/useHLSPlayer';
import { VideoControls } from './VideoControls';
import { CanvasDetectionOverlay } from './CanvasDetectionOverlay';
import { ModelSelector } from './ModelSelector';
import { DemoVideoButtons } from './DemoVideoButtons';
import SettingsService from '@/services/SettingsService';
import StorageServiceFactory from '@/services/storage/StorageServiceFactory';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

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

interface Detection {
  id: string;
  label: string;
  confidence: number;
  bbox: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    width: number;
    height: number;
  };
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
  const [ffmpegSettings, setFfmpegSettings] = useState<any>({});
  const [activeTab, setActiveTab] = useState<string>('url');

  useEffect(() => {
    // Load FFmpeg settings
    const settings = SettingsService.getSettings('ffmpeg');
    setFfmpegSettings(settings);
    
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
    isTranscoding,
    formatNotSupported,
    isLiveStream,
    streamProcessing,
    videoRef,
    containerRef,
    startStream,
    stopStream,
    togglePlayPause,
    handleFileUpload,
    handleVideoMetadata,
    handleVideoError,
    setHasUploadedFile,
    setOriginalFile,
    originalFile,
    processRtspStream,
    isStreamingUrl,
    enableHLS,
    setHlsEnabled
  } = useVideoFeed({
    initialVideoUrl,
    autoStart,
    camera,
    activeModels: selectedModels,
    streamType,
    fps
  });

  // Updated HLS hook with additional debug logging
  const { error: hlsError, isHLSSource } = useHLSPlayer({
    videoRef,
    src: videoUrl,
    autoPlay: isPlaying,
    enabled: enableHLS && isStreaming
  });

  useEffect(() => {
    if (hlsError) {
      console.error('HLS Playback Error:', hlsError);
      toast.error('HLS Playback Error', {
        description: hlsError
      });
    }
  }, [hlsError]);

  // Log when video URL changes for debugging
  useEffect(() => {
    if (videoUrl) {
      console.log('Video URL changed to:', videoUrl);
      console.log('Is HLS source?', isHLSSource(videoUrl));
    }
  }, [videoUrl, isHLSSource]);

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

  // Helper to show appropriate processing message
  const getProcessingMessage = () => {
    if (isModelLoading) return 'Loading AI model...';
    if (isTranscoding) return 'Transcoding video...';
    if (streamProcessing) return 'Setting up camera stream...';
    return 'Processing video...';
  };

  // Updated isRtspUrl to include HLS streams
  const isRtspUrl = (url: string) => {
    return url.toLowerCase().startsWith('rtsp://') || 
           url.toLowerCase().startsWith('rtsps://') || 
           url.toLowerCase().startsWith('rtmp://') ||
           url.toLowerCase().includes('.m3u8');
  };

  if (!showControls) {
    return (
      <div className="video-feed relative" ref={containerRef}>
        {isProcessing || isModelLoading || isTranscoding || streamProcessing ? (
          <div className="flex flex-col items-center justify-center bg-gray-100 dark:bg-gray-800 rounded-md" style={{ height: '160px' }}>
            <Loader className="text-avianet-red animate-spin" size={24} />
            <p className="text-sm mt-2 text-gray-500">{getProcessingMessage()}</p>
          </div>
        ) : formatNotSupported ? (
          <div className="flex flex-col items-center justify-center bg-red-50 dark:bg-red-900/20 rounded-md" style={{ height: '160px' }}>
            <AlertTriangle className="text-red-500" size={24} />
            <p className="text-sm mt-2 text-red-600 dark:text-red-400">
              Format not supported
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
                detections={detections as any[]} 
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
              isLiveStream={isLiveStream}
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

  // URL Tab - updated with debug button for HLS streams
  const handleTestHls = () => {
    if (!videoUrl) return;
    
    console.log('Testing direct HLS access...');
    // Create a test element to verify URL can be fetched
    const testImg = document.createElement('img');
    testImg.style.display = 'none';
    testImg.onload = () => {
      console.log('Successfully accessed resource (HEAD request)');
      document.body.removeChild(testImg);
    };
    testImg.onerror = () => {
      console.log('Failed to access resource directly');
      document.body.removeChild(testImg);
      
      // Try a direct fetch for more debugging info
      fetch(videoUrl, { method: 'HEAD' })
        .then(response => {
          console.log('Fetch response:', response.status, response.statusText);
          if (!response.ok) {
            toast.error(`Resource not accessible (${response.status})`);
          } else {
            toast.success('Resource is accessible via fetch');
          }
        })
        .catch(err => {
          console.error('Fetch error:', err);
          toast.error(`Network error: ${err.message}`);
        });
    };
    document.body.appendChild(testImg);
    testImg.src = videoUrl;
  };

  const renderUrlTab = () => (
    <TabsContent value="url" className="mt-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="video-url">Video URL</Label>
        <div className="flex mt-1">
          <Input
            id="video-url"
            placeholder="Enter video URL... (MP4, WebM, HLS .m3u8, etc.)"
            value={videoUrl}
            onChange={(e) => {
              setVideoUrl(e.target.value);
              setHasUploadedFile(false);
              setOriginalFile(null);
            }}
            className="rounded-r-none"
            disabled={hasUploadedFile || isProcessing || isTranscoding || streamProcessing}
          />
          <Button
            variant={isStreaming ? "destructive" : "default"}
            onClick={isStreaming ? stopStream : startStream}
            className="rounded-l-none"
            disabled={isProcessing || isModelLoading || isTranscoding || streamProcessing || (!videoUrl && !hasUploadedFile)}
          >
            {isStreaming ? "Stop" : "Start"}
          </Button>
        </div>
        
        <div className="flex gap-2 mt-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleTestHls}
            disabled={!videoUrl}
            className="text-xs"
          >
            Test URL Accessibility
          </Button>
          
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => setHlsEnabled(!enableHLS)}
            className="text-xs"
          >
            {enableHLS ? "Disable HLS" : "Enable HLS"}
          </Button>
        </div>
        
        <p className="text-xs text-muted-foreground">
          Supports direct video files (.mp4, .webm) and HLS streams (.m3u8)
          {enableHLS ? " - HLS mode enabled" : " - Standard mode enabled"}
        </p>
        
        <DemoVideoButtons
          onSelectDemo={handleDemoVideo}
          isProcessing={isProcessing || isModelLoading || isTranscoding || streamProcessing}
        />
      </div>
    </TabsContent>
  );

  // Replace the URL TabsContent with our custom one
  const TabsContentToReplace = <TabsContent value="url" className="mt-4">{/* original content */}</TabsContent>;
  
  // When rendering Tabs, replace the URL TabsContent
  return (
    <Card className="w-full">
      <CardHeader className="border-b">
        <CardTitle className="flex items-center flex-wrap gap-2">
          <Camera className="mr-2 text-avianet-red" size={20} />
          Real-time Video Feed
          {isHLSSource(videoUrl) && (
            <Badge variant="outline" className="bg-purple-500 text-white">
              HLS STREAM
            </Badge>
          )}
          {isHikvisionFormat && (
            <Badge variant="outline" className="bg-blue-500 text-white">
              HIKVISION
            </Badge>
          )}
          {isLiveStream && (
            <Badge variant="outline" className="bg-green-500 text-white">
              LIVE STREAM
            </Badge>
          )}
          {actualFps !== null && (
            <Badge variant="outline" className="bg-gray-200 dark:bg-gray-700">
              {actualFps} FPS
            </Badge>
          )}
          {isTranscoding && (
            <Badge variant="outline" className="bg-yellow-500 text-white animate-pulse">
              TRANSCODING
            </Badge>
          )}
          {streamProcessing && (
            <Badge variant="outline" className="bg-blue-500 text-white animate-pulse">
              STREAM SETUP
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
          
          {formatNotSupported && !isHLSSource(videoUrl) && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Video format not supported</AlertTitle>
              <AlertDescription>
                <p>This video format cannot be played directly in your browser. Please try one of these options:</p>
                <ul className="list-disc pl-6 mt-2">
                  <li>Enable server-side transcoding in Settings → FFmpeg</li>
                  <li>Upload an MP4 or WebM file instead</li>
                  <li>Use a streaming URL instead of a raw file</li>
                </ul>
              </AlertDescription>
            </Alert>
          )}

          <Tabs defaultValue="url" value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid grid-cols-3">
              <TabsTrigger value="url" className="flex items-center gap-2">
                <VideoIcon className="h-4 w-4" />
                Video URL
              </TabsTrigger>
              <TabsTrigger value="camera" className="flex items-center gap-2">
                <Network className="h-4 w-4" />
                IP Camera
              </TabsTrigger>
              <TabsTrigger value="file" className="flex items-center gap-2">
                <FileVideo className="h-4 w-4" />
                File Upload
              </TabsTrigger>
            </TabsList>
            
            {/* Replace with our custom URL tab content */}
            {renderUrlTab()}
            
            {/* IP Camera Tab */}
            <TabsContent value="camera" className="mt-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="camera-url">IP Camera URL</Label>
                <div className="flex mt-1">
                  <Input
                    id="camera-url"
                    placeholder="Enter camera URL... (RTSP, HTTP, RTMP)"
                    value={videoUrl}
                    onChange={(e) => {
                      setVideoUrl(e.target.value);
                      setHasUploadedFile(false);
                      setOriginalFile(null);
                    }}
                    className="rounded-r-none"
                    disabled={isProcessing || isTranscoding || streamProcessing}
                  />
                  <Button
                    variant={isStreaming ? "destructive" : "default"}
                    onClick={isStreaming ? stopStream : startStream}
                    className="rounded-l-none"
                    disabled={isProcessing || isModelLoading || isTranscoding || streamProcessing || !videoUrl}
                  >
                    {isStreaming ? "Stop" : "Start"}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Supports RTSP (rtsp://...), RTMP, HTTP streams, and HLS (.m3u8)
                </p>
                
                <div className="mt-2 flex flex-col gap-2">
                  <h4 className="text-sm font-medium">Common URL formats:</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="border rounded-md p-2 text-xs">
                      <strong>Hikvision:</strong> rtsp://username:password@192.168.1.64:554/Streaming/channels/101
                    </div>
                    <div className="border rounded-md p-2 text-xs">
                      <strong>Dahua:</strong> rtsp://username:password@192.168.1.108:554/cam/realmonitor?channel=1&subtype=0
                    </div>
                    <div className="border rounded-md p-2 text-xs">
                      <strong>Generic ONVIF:</strong> rtsp://username:password@192.168.1.100:554/onvif1
                    </div>
                    <div className="border rounded-md p-2 text-xs">
                      <strong>HLS Stream:</strong> http://example.com/stream/index.m3u8
                    </div>
                  </div>
                </div>
                
                {isRtspUrl(videoUrl) && (
                  <Alert className="mt-2 bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300">
                    <RefreshCw className="h-4 w-4" />
                    <AlertTitle>RTSP Stream Detected</AlertTitle>
                    <AlertDescription>
                      This RTSP stream will be automatically converted to a web-compatible format using FFmpeg.
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            </TabsContent>
            
            {/* File Upload Tab */}
            <TabsContent value="file" className="mt-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="video-file">Upload a video file</Label>
                <Input
                  id="video-file"
                  type="file"
                  accept="video/*,.dav,.h264,.h265,.ts,.mkv,.avi,video/x-msvideo,video/x-matroska"
                  onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
                  disabled={isProcessing || isModelLoading || isTranscoding || streamProcessing}
                />
                <div className="flex items-center">
                  <FileVideo className="text-gray-400 mr-1" size={14} />
                  <p className="text-xs text-muted-foreground">
                    Supports MP4, WebM, Hikvision DAV, AVI, MKV, H.264/H.265, and other NVR export formats
                    {ffmpegSettings.serverTranscoding ? " (Server transcoding enabled)" : " (Enable server transcoding in Settings for better compatibility)"}
                  </p>
                </div>
                
                {hasUploadedFile && originalFile && (
                  <div className="mt-2 border rounded-md p-2">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">{originalFile.name}</p>
                      <Badge variant="outline">{(originalFile.size / (1024 * 1024)).toFixed(2)} MB</Badge>
                    </div>
                    
                    <div className="mt-2 flex justify-between">
                      <Button 
                        size="sm"
                        onClick={() => {
                          setOriginalFile(null);
                          setHasUploadedFile(false);
                          setVideoUrl('');
                        }}
                        variant="outline"
                        className="text-xs"
                      >
                        Remove
                      </Button>
                      
                      <Button
                        size="sm"
                        onClick={startStream}
                        disabled={isStreaming || isProcessing || isTranscoding || streamProcessing}
                        className="text-xs"
                      >
                        {isStreaming ? "Stop" : "Process & Play"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>

          {(isProcessing || isTranscoding || isModelLoading || streamProcessing) && (
            <div className="flex flex-col items-center justify-center p-4 border rounded-md bg-gray-50 dark:bg-gray-800/50">
              <Loader className="text-avianet-red animate-spin mb-2" size={32} />
              <p className="font-medium">{getProcessingMessage()}</p>
              <p className="text-sm text-muted-foreground mt-1">
                {isTranscoding ? 'Converting video to browser-compatible format...' : 
                 streamProcessing ? 'Setting up camera stream for web playback...' :
                 isModelLoading ? 'Loading AI detection model...' : 
                 'Processing video file...'}
              </p>
              <Progress value={45} className="w-full h-1 mt-3" />
            </div>
          )}

          <div className="video-feed mt-4 relative" ref={containerRef}>
            {isProcessing ? (
              <div className="flex flex-col items-center justify-center bg-gray-100 dark:bg-gray-800 rounded-md" style={{ height: '360px' }}>
                <Loader className="text-avianet-red animate-spin mb-2" size={48} />
                <p className="text-gray-700 dark:text-gray-300">Processing video...</p>
                <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">This may take a moment depending on the file size</p>
              </div>
            ) : isTranscoding ? (
              <div className="flex flex-col items-center justify-center bg-gray-100 dark:bg-gray-800 rounded-md" style={{ height: '360px' }}>
                <Loader className="text-yellow-500 animate-spin mb-2" size={48} />
                <p className="text-gray-700 dark:text-gray-300">Transcoding video...</p>
                <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Converting video to browser-compatible format</p>
              </div>
            ) : streamProcessing ? (
              <div className="flex flex-col items-center justify-center bg-gray-100 dark:bg-gray-800 rounded-md" style={{ height: '360px' }}>
                <Loader className="text-blue-500 animate-spin mb-2" size={48} />
                <p className="text-gray-700 dark:text-gray-300">Setting up camera stream...</p>
                <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Converting RTSP stream to web-compatible format</p>
              </div>
            ) : isModelLoading ? (
              <div className="flex flex-col items-center justify-center bg-gray-100 dark:bg-gray-800 rounded-md" style={{ height: '360px' }}>
                <Loader className="text-avianet-red animate-spin mb-2" size={48} />
                <p className="text-gray-700 dark:text-gray-300">Loading AI model...</p>
                <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">This may take a moment for custom models</p>
              </div>
            ) : formatNotSupported && !isHLSSource(videoUrl) ? (
              <div className="flex flex-col items-center justify-center bg-red-50 dark:bg-red-900/20 rounded-md" style={{ height: '360px' }}>
                <AlertTriangle className="text-red-500 mb-2" size={48} />
                <p className="text-red-700 dark:text-red-400">Video format not supported</p>
                <p className="text-red-600 dark:text-red-300 text-sm mt-1">Enable server-side transcoding in Settings or try a different format</p>
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
                  loop={!isLiveStream}
                  playsInline
                  className="w-full"
                  controls
                />
                
                <div className="absolute inset-0 pointer-events-none">
                  <CanvasDetectionOverlay detections={detections as any[]} videoRef={videoRef} />
                </div>
                
                <VideoControls
                  isPlaying={isPlaying}
                  onPlayPause={togglePlayPause}
                  inferenceLocation={inferenceLocation}
                  inferenceTime={inferenceTime}
                  isHikvisionFormat={isHikvisionFormat}
                  isLiveStream={isLiveStream}
                />
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center bg-gray-100 dark:bg-gray-800 rounded-md" style={{ height: '360px' }}>
                <VideoIcon className="text-gray-400 mb-2" size={48} />
                <p className="text-gray-500 dark:text-gray-400">No video stream active</p>
                <p className="text-gray-400 dark:text-gray-500 text-sm mt-1">Enter a URL, connect to an IP camera, or upload a file to begin</p>
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
              <li>Models directory: {SettingsService.getStorageConfig().modelsPath}</li>
              <li>Settings directory: {SettingsService.getStorageConfig().settingsPath}</li>
              {ffmpegSettings.serverTranscoding && (
                <li>Server FFmpeg path: {ffmpegSettings.serverBinaryPath || 'Default'}</li>
              )}
              <li>Transcoding: {ffmpegSettings.serverTranscoding ? `Enabled (${ffmpegSettings.transcodeFormat || 'mp4'})` : 'Disabled'}</li>
            </ul>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default VideoFeed;
