
import { useState, useRef, useEffect } from 'react';
import { toast } from 'sonner';
import EdgeAIInference, { Detection } from '@/services/EdgeAIInference';
import { convertToPlayableFormat } from '@/utils/ffmpegUtils';

interface UseVideoFeedProps {
  initialVideoUrl?: string;
  autoStart?: boolean;
  camera?: {
    id: string;
    name: string;
    streamUrl: {
      main: string;
      sub: string;
    };
  };
  activeModel?: { name: string; path: string };
  streamType?: 'main' | 'sub';
}

export const useVideoFeed = ({
  initialVideoUrl = '',
  autoStart = false,
  camera,
  activeModel,
  streamType = 'main'
}: UseVideoFeedProps) => {
  const [videoUrl, setVideoUrl] = useState(initialVideoUrl);
  const [isStreaming, setIsStreaming] = useState(autoStart);
  const [isPlaying, setIsPlaying] = useState(autoStart);
  const [detections, setDetections] = useState<Detection[]>([]);
  const [resolution, setResolution] = useState({ width: 640, height: 360 });
  const [isProcessing, setIsProcessing] = useState(false);
  const [hasUploadedFile, setHasUploadedFile] = useState(false);
  const [originalFile, setOriginalFile] = useState<File | null>(null);
  const [inferenceLocation, setInferenceLocation] = useState<'edge' | 'server' | null>(null);
  const [inferenceTime, setInferenceTime] = useState<number | null>(null);
  const [isHikvisionFormat, setIsHikvisionFormat] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const detectObjects = async () => {
    if (!activeModel && !camera) {
      setDetections([]);
      return;
    }

    try {
      const modelToUse = activeModel;
      
      const request = {
        imageData: "base64_image_data_would_go_here",
        cameraId: camera?.id || videoUrl || "unknown",
        modelName: modelToUse?.name || "YOLOv11",
        modelPath: modelToUse?.path || "/models/yolov11.onnx",
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
          await handleFileUpload(originalFile);
        }
      }
    }
    
    if (!autoStart) {
      toast.success('Video stream started', {
        description: 'Object detection is now active'
      });
    }
    
    if (activeModel) {
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

  const togglePlayPause = async () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
        setIsPlaying(false);
      } else {
        try {
          // Fix: Ensure we actually wait for the play() promise to resolve
          await videoRef.current.play();
          setIsPlaying(true);
        } catch (err) {
          console.error("Video play error in togglePlayPause:", err);
          toast.error('Could not play video', {
            description: 'The video may be in an unsupported format or the stream is unavailable'
          });
        }
      }
    }
  };

  const handleFileUpload = async (file: File) => {
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
      handleFileUpload(originalFile);
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

  return {
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
    isHikvisionFormat,
    setIsHikvisionFormat,
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
  };
};
