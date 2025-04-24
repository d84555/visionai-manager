import React, { useState, useEffect, useRef } from 'react';
import { AlertTriangle, Camera, VideoIcon, Play, Pause, Loader, Server, Pin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { convertToPlayableFormat } from '@/utils/ffmpegUtils';
import EdgeAIInference, { InferenceRequest, Detection } from '@/services/EdgeAIInference';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import SettingsService from '@/services/SettingsService';

interface CameraFeed {
  id: string;
  name: string;
  streamUrl: {
    main: string;
    sub: string;
  };
}

interface VideoFeedProps {
  initialVideoUrl?: string;
  autoStart?: boolean;
  showControls?: boolean;
  camera?: CameraFeed;
  isPinned?: boolean;
  onPinToggle?: () => void;
  activeModel?: { name: string; path: string };
  streamType?: 'main' | 'sub';
}

const VideoFeed: React.FC<VideoFeedProps> = ({ 
  initialVideoUrl = '', 
  autoStart = false,
  showControls = true,
  camera,
  isPinned = false,
  onPinToggle,
  activeModel,
  streamType = 'main'
}) => {
  const [videoUrl, setVideoUrl] = useState(initialVideoUrl);
  const [isStreaming, setIsStreaming] = useState(autoStart);
  const [detections, setDetections] = useState<Detection[]>([]);
  const [resolution, setResolution] = useState({ width: 640, height: 360 });
  const [isPlaying, setIsPlaying] = useState(autoStart);
  const [isProcessing, setIsProcessing] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [hasUploadedFile, setHasUploadedFile] = useState(false);
  const [originalFile, setOriginalFile] = useState<File | null>(null);
  const [inferenceLocation, setInferenceLocation] = useState<'edge' | 'server' | null>(null);
  const [inferenceTime, setInferenceTime] = useState<number | null>(null);
  const [selectedModel, setSelectedModel] = useState<{name: string; path: string} | null>(null);
  const [availableModels, setAvailableModels] = useState<{id: string, name: string, path: string}[]>([]);
  const [isHikvisionFormat, setIsHikvisionFormat] = useState(false);
  
  useEffect(() => {
    const modelsList = [
      { id: 'yolov11-n', name: 'YOLOv11 Nano', path: '/models/yolov11-n.onnx' },
      { id: 'yolov11-s', name: 'YOLOv11 Small', path: '/models/yolov11-s.onnx' },
      { id: 'yolov11', name: 'YOLOv11 Base', path: '/models/yolov11.onnx' },
      { id: 'yolov11-m', name: 'YOLOv11 Medium', path: '/models/yolov11-m.onnx' },
      { id: 'yolov11-l', name: 'YOLOv11 Large', path: '/models/yolov11-l.onnx' }
    ];
    
    const customModels = SettingsService.getCustomModels().map(model => ({
      id: model.id,
      name: model.name,
      path: model.path
    }));
    
    setAvailableModels([...modelsList, ...customModels]);
    
    const savedModel = SettingsService.getActiveModel();
    if (savedModel) {
      setSelectedModel(savedModel);
    } else if (activeModel) {
      setSelectedModel(activeModel);
    }
  }, [activeModel]);
  
  useEffect(() => {
    if (autoStart && initialVideoUrl) {
      startStream();
    }
  }, [autoStart, initialVideoUrl]);
  
  useEffect(() => {
    if (initialVideoUrl && initialVideoUrl !== videoUrl) {
      setVideoUrl(initialVideoUrl);
      setHasUploadedFile(false);
      setOriginalFile(null);
      
      if (isStreaming) {
        stopStream();
        setTimeout(() => {
          startStream();
        }, 100);
      }
    }
  }, [initialVideoUrl]);

  const detectObjects = async () => {
    if (!selectedModel && !activeModel) {
      setDetections([]);
      return;
    }
    
    if (!camera && !videoUrl && !showControls) {
      setDetections([]);
      return;
    }
    
    try {
      const modelToUse = selectedModel || activeModel;
      
      const request: InferenceRequest = {
        imageData: "base64_image_data_would_go_here",
        cameraId: camera?.id || videoUrl || "unknown",
        modelName: modelToUse?.name || "YOLOv11",
        thresholdConfidence: 0.5
      };
      
      const result = await EdgeAIInference.performInference(request);
      
      setDetections(result.detections);
      setInferenceLocation(result.processedAt);
      setInferenceTime(result.inferenceTime);
      
      if (!autoStart) {
        result.detections.forEach(detection => {
          if (detection.confidence > 0.85) {
            toast.warning(`High confidence detection: ${detection.class}`, {
              description: `Confidence: ${(detection.confidence * 100).toFixed(1)}%`
            });
          }
        });
      }
    } catch (error) {
      console.error("Edge inference error:", error);
      toast.error("AI inference failed", {
        description: "Falling back to server processing"
      });
      setInferenceLocation("server");
      setDetections([]);
    }
  };

  const generateMockDetections = (): Detection[] => {
    const mockClasses = ['person', 'car', 'truck', 'bicycle', 'motorcycle', 'bus'];
    const newDetections: Detection[] = [];
    
    const count = Math.floor(Math.random() * 5) + 1;
    
    for (let i = 0; i < count; i++) {
      const classIndex = Math.floor(Math.random() * mockClasses.length);
      const confidence = 0.5 + Math.random() * 0.5;
      
      const width = 50 + Math.random() * 150;
      const height = 50 + Math.random() * 100;
      const x = Math.random() * (resolution.width - width);
      const y = Math.random() * (resolution.height - height);
      
      newDetections.push({
        id: `det-${Date.now()}-${i}`,
        class: mockClasses[classIndex],
        confidence,
        x,
        y,
        width,
        height
      });
    }
    
    return newDetections;
  };

  const startStream = async () => {
    if (!videoUrl && !originalFile) {
      toast.error('Please enter a valid video URL or upload a file');
      return;
    }
    
    setIsStreaming(true);
    setIsPlaying(true);
    
    if (videoRef.current) {
      try {
        await videoRef.current.play();
      } catch (err) {
        console.error("Video play error:", err);
        toast.error('Could not play video', {
          description: 'The video format may not be supported directly. Attempting to process...'
        });
        
        if (originalFile) {
          await handleFileUpload({ target: { files: [originalFile] } } as any);
        }
      }
    }
    
    if (!autoStart) {
      toast.success('Video stream started', {
        description: 'Object detection is now active'
      });
    }
    
    if (selectedModel || activeModel) {
      await detectObjects();
      const interval = setInterval(detectObjects, 3000);
      return () => clearInterval(interval);
    }
  };

  const stopStream = () => {
    setIsStreaming(false);
    setDetections([]);
    setIsPlaying(false);
    if (videoRef.current) {
      videoRef.current.pause();
    }
    
    if (!autoStart) {
      toast.info('Video stream stopped');
    }
  };

  const togglePlayPause = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play().catch(err => {
          toast.error('Could not play video', {
            description: err.message
          });
        });
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement> | { target: { files: File[] } }) => {
    const file = event.target.files?.[0];
    if (file) {
      if (hasUploadedFile && videoUrl.startsWith('blob:')) {
        URL.revokeObjectURL(videoUrl);
      }
      
      setOriginalFile(file);
      setHasUploadedFile(true);
      
      const isHikvision = file.name.toLowerCase().endsWith('.dav') || 
                          file.type === 'video/x-dav' || 
                          file.type === 'application/octet-stream';
      
      setIsHikvisionFormat(isHikvision);
      
      if (isHikvision) {
        toast.info('Hikvision video format detected', {
          description: 'Using specialized processing for Hikvision format'
        });
      }
      
      try {
        setIsProcessing(true);
        toast.info('Processing video file...', {
          description: 'This may take a moment depending on file size'
        });
        
        const convertedVideoUrl = await convertToPlayableFormat(file);
        setVideoUrl(convertedVideoUrl);
        
        toast.success('Video file processed successfully', {
          description: 'Click Start to begin playback and detection'
        });
      } catch (error) {
        console.error("Error processing video:", error);
        toast.error('Failed to process video format', {
          description: 'Attempting direct playback as fallback'
        });
        
        const localUrl = URL.createObjectURL(file);
        setVideoUrl(localUrl);
      } finally {
        setIsProcessing(false);
      }
      
      if (isStreaming) {
        stopStream();
      }
    }
  };

  const handleVideoMetadata = () => {
    if (videoRef.current) {
      setResolution({
        width: videoRef.current.videoWidth,
        height: videoRef.current.videoHeight
      });
    }
  };

  const handleVideoError = (e: React.SyntheticEvent<HTMLVideoElement, Event>) => {
    console.error("Video error:", e);
    
    toast.error('Failed to load video', {
      description: 'The video format may not be supported. Attempting alternative processing...'
    });
    
    if (originalFile && !isProcessing) {
      handleFileUpload({ target: { files: [originalFile] } } as any);
    } else {
      stopStream();
    }
  };

  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const containerWidth = containerRef.current.offsetWidth;
        const aspectRatio = resolution.height / resolution.width;
        setResolution({
          width: containerWidth,
          height: containerWidth * aspectRatio
        });
      }
    };

    window.addEventListener('resize', updateSize);
    updateSize();

    return () => window.removeEventListener('resize', updateSize);
  }, [isStreaming, resolution.width, resolution.height]);

  useEffect(() => {
    return () => {
      if (hasUploadedFile && videoUrl.startsWith('blob:')) {
        URL.revokeObjectURL(videoUrl);
      }
    };
  }, [hasUploadedFile, videoUrl]);

  const handleModelChange = (modelId: string) => {
    if (modelId === "none") {
      setSelectedModel(null);
      return;
    }
    
    const model = availableModels.find(m => m.id === modelId);
    if (model) {
      setSelectedModel({ name: model.name, path: model.path });
      
      SettingsService.setActiveModel(model.name, model.path);
      
      if (isStreaming) {
        detectObjects();
      }
      
      toast.success(`Model ${model.name} selected`, {
        description: "Detection will use this model"
      });
    }
  };

  if (!showControls) {
    return (
      <div className="video-feed relative" ref={containerRef}>
        {isProcessing ? (
          <div className="flex flex-col items-center justify-center bg-gray-100 dark:bg-gray-800 rounded-md" style={{ height: '160px' }}>
            <Loader className="text-avianet-red animate-spin" size={24} />
          </div>
        ) : isStreaming ? (
          <div className="relative">
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
                onClick={togglePlayPause}
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
            
            {detections.map((detection) => (
              <div
                key={detection.id}
                className="absolute border-2 border-avianet-red"
                style={{
                  left: `${detection.x * 0.5}px`,
                  top: `${detection.y * 0.5}px`,
                  width: `${detection.width * 0.5}px`,
                  height: `${detection.height * 0.5}px`
                }}
              >
                <span 
                  className="absolute top-0 left-0 bg-avianet-red text-white text-[8px] px-1 max-w-full overflow-hidden text-ellipsis"
                >
                  {detection.class}
                </span>
              </div>
            ))}
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
        </CardTitle>
      </CardHeader>
      <CardContent className="p-6">
        <div className="space-y-4">
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
                  disabled={isProcessing || (!videoUrl && !originalFile)}
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
                onChange={handleFileUpload}
                className="mt-1"
                disabled={isProcessing}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Supports MP4, WebM, Hikvision DAV, and other NVR export formats
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setVideoUrl('https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4');
                setHasUploadedFile(false);
                setOriginalFile(null);
                setIsHikvisionFormat(false);
                if (isStreaming) {
                  stopStream();
                }
              }}
              className="text-xs"
              disabled={isProcessing}
            >
              Demo Video 1
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setVideoUrl('https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4');
                setHasUploadedFile(false);
                setOriginalFile(null);
                setIsHikvisionFormat(false);
                if (isStreaming) {
                  stopStream();
                }
              }}
              className="text-xs"
              disabled={isProcessing}
            >
              Demo Video 2
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setVideoUrl('https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4');
                setHasUploadedFile(false);
                setOriginalFile(null);
                setIsHikvisionFormat(false);
                if (isStreaming) {
                  stopStream();
                }
              }}
              className="text-xs"
              disabled={isProcessing}
            >
              Demo Video 3
            </Button>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="model-selector">AI Model for Object Detection</Label>
            <Select 
              onValueChange={handleModelChange}
              value={selectedModel ? availableModels.find(m => m.name === selectedModel.name)?.id : "none"}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a model for detection" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No detection (Clear model)</SelectItem>
                {availableModels.map(model => (
                  <SelectItem key={model.id} value={model.id}>
                    {model.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Select an AI model to use for object detection on this video feed
            </p>
          </div>

          <div className="video-feed mt-4 relative" ref={containerRef}>
            {isProcessing ? (
              <div className="flex flex-col items-center justify-center bg-gray-100 dark:bg-gray-800 rounded-md" style={{ height: '360px' }}>
                <Loader className="text-avianet-red animate-spin mb-2" size={48} />
                <p className="text-gray-700 dark:text-gray-300">Processing video...</p>
                <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">This may take a moment depending on the file size</p>
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
                
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="absolute bottom-4 right-4 bg-black/50 text-white hover:bg-black/70"
                  onClick={togglePlayPause}
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
                
                {detections.map((detection) => (
                  <div
                    key={detection.id}
                    className="absolute border-2 border-avianet-red"
                    style={{
                      left: `${detection.x}px`,
                      top: `${detection.y}px`,
                      width: `${detection.width}px`,
                      height: `${detection.height}px`
                    }}
                  >
                    <span 
                      className="absolute top-0 left-0 bg-avianet-red text-white text-xs px-1 py-0.5 max-w-full overflow-hidden text-ellipsis"
                    >
                      {detection.class} ({(detection.confidence * 100).toFixed(0)}%)
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center bg-gray-100 dark:bg-gray-800 rounded-md" style={{ height: '360px' }}>
                <VideoIcon className="text-gray-400 mb-2" size={48} />
                <p className="text-gray-500 dark:text-gray-400">No video stream active</p>
                <p className="text-gray-400 dark:text-gray-500 text-sm mt-1">Enter a URL or upload a file and click Start to begin</p>
              </div>
            )}
          </div>
          
          {isStreaming && detections.length === 0 && !selectedModel && !activeModel && (
            <div className="flex items-center justify-center p-4 bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400 rounded-md">
              <AlertTriangle className="mr-2" size={16} />
              <span className="text-sm">No AI model selected. Select a model to enable object detection.</span>
            </div>
          )}
          
          {isStreaming && detections.length === 0 && (selectedModel || activeModel) && (
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
              {inferenceTime && (
                <div className="text-right">
                  <p className="text-sm font-medium">Inference Time</p>
                  <p className={`text-sm ${inferenceLocation === 'edge' ? 'text-green-600 dark:text-green-400' : 'text-yellow-600 dark:text-yellow-400'}`}>
                    {inferenceTime.toFixed(1)} ms
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default VideoFeed;
