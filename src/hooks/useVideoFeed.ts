import { useState, useRef, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import EdgeAIInference, { Detection, BackendDetection } from '@/services/EdgeAIInference';
import { convertToPlayableFormat } from '@/utils/ffmpegUtils';
import SettingsService from '@/services/SettingsService';

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
  const [isModelLoading, setIsModelLoading] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const detectionIntervalRef = useRef<number | null>(null);
  const lastDetectionTimeRef = useRef<number>(0);
  const detectionFrequencyMs = 1000; // Process every second

  const detectObjects = useCallback(async () => {
    if (!activeModel && !camera) {
      setDetections([]);
      return;
    }

    try {
      const modelToUse = activeModel;
      
      if (!videoRef.current || videoRef.current.paused) {
        console.log("Video is paused or not available for detection");
        return;
      }
      
      // Rate limiting to avoid too frequent detection calls
      const now = Date.now();
      if (now - lastDetectionTimeRef.current < detectionFrequencyMs) {
        return;
      }
      lastDetectionTimeRef.current = now;
      
      if (!canvasRef.current) {
        const canvas = document.createElement('canvas');
        canvas.width = videoRef.current.videoWidth || 640;
        canvas.height = videoRef.current.videoHeight || 360;
        canvasRef.current = canvas;
      }
      
      const ctx = canvasRef.current.getContext('2d');
      if (ctx && videoRef.current) {
        // Ensure canvas matches video dimensions exactly
        canvasRef.current.width = videoRef.current.videoWidth || 640;
        canvasRef.current.height = videoRef.current.videoHeight || 360;
        
        // Draw the current video frame to the canvas
        ctx.drawImage(videoRef.current, 0, 0, canvasRef.current.width, canvasRef.current.height);
        
        const imageData = canvasRef.current.toDataURL('image/jpeg', 0.8);
        
        if (!modelToUse) {
          console.warn("No model specified for inference");
          return;
        }
        
        console.log(`Using model: ${modelToUse.name}, path: ${modelToUse.path}`);
        
        const request = {
          imageData: imageData,
          cameraId: camera?.id || videoUrl || "unknown",
          modelName: modelToUse.name || "custom_model",
          modelPath: modelToUse.path || "",
          thresholdConfidence: 0.5
        };
        
        console.log(`Performing inference with model: ${request.modelName}`);
        const result = await EdgeAIInference.performInference(request);
        
        if (result.detections.length > 0) {
          console.log(`Detected ${result.detections.length} objects with model ${request.modelName}`);
          console.log(`Sample detection:`, result.detections[0]);
          
          // Create normalized detections with unique IDs
          const normalizedDetections = result.detections.map((detection: BackendDetection, index) => {
            // Create a unique ID for React
            const uniqueId = `${index}-${Date.now()}`;
            
            // Return the detection with the original bbox data preserved
            return {
              id: uniqueId,
              label: detection.label || 'Object',
              confidence: detection.confidence || 0,
              bbox: detection.bbox // Keep the original bbox array [x1, y1, x2, y2]
            };
          });
          
          // Filter out detections with very low confidence
          const filteredDetections = normalizedDetections.filter(d => 
            d.confidence > 0.25 // Only show detections with confidence > 25%
          );
          
          console.log(`Filtered to ${filteredDetections.length} detections above threshold`);
          setDetections(filteredDetections);
          setInferenceLocation(result.processedAt);
          setInferenceTime(result.inferenceTime);
          
          // Dispatch detection event for other components
          window.dispatchEvent(new CustomEvent('ai-detection', { 
            detail: { 
              detections: result.detections,
              modelName: request.modelName,
              timestamp: new Date(),
              source: camera?.id || "video-feed" 
            } 
          }));
          
          if (!autoStart && result.detections.length > 0) {
            const highConfDetection = result.detections.find(d => d.confidence > 0.85);
            if (highConfDetection) {
              toast.warning(`High confidence detection: ${highConfDetection.label}`, {
                description: `Confidence: ${(highConfDetection.confidence * 100).toFixed(1)}%`
              });
            }
          }
        } else {
          setDetections([]);
        }
      }
    } catch (error) {
      console.error("Edge inference error:", error);
      toast.error("AI inference failed", {
        description: "Check if the Edge Computing node is running and the model is valid"
      });
      setInferenceLocation("server");
      setDetections([]);
    }
  }, [activeModel, camera, videoUrl, autoStart]);

  const startStream = async () => {
    if (!videoUrl && !originalFile) {
      toast.error('Please enter a valid video URL or upload a file');
      return;
    }
    
    setIsStreaming(true);
    setIsPlaying(true);
    
    if (activeModel?.path.includes('/custom_models/')) {
      setIsModelLoading(true);
      try {
        console.log(`Using custom model from API server: ${activeModel.path}`);
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        console.error("Error loading custom model:", error);
      } finally {
        setIsModelLoading(false);
      }
    }
    
    if (videoRef.current) {
      try {
        await videoRef.current.play();
        setIsPlaying(true);
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
      if (detectionIntervalRef.current) {
        clearInterval(detectionIntervalRef.current);
      }
      
      await detectObjects();
      
      detectionIntervalRef.current = window.setInterval(detectObjects, 3000);
    }
  };

  const stopStream = () => {
    setIsStreaming(false);
    setDetections([]);
    setIsPlaying(false);
    
    if (detectionIntervalRef.current) {
      clearInterval(detectionIntervalRef.current);
      detectionIntervalRef.current = null;
    }
    
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
      
      localStorage.setItem(`video-file-${Date.now()}`, JSON.stringify({
        originalName: file.name,
        size: file.size,
        type: file.type,
        blobUrl: convertedVideoUrl,
        storedAt: SettingsService.localStorageConfig.basePath + 'videos/' + file.name,
        createdAt: new Date().toISOString()
      }));
      
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
      const width = videoRef.current.videoWidth;
      const height = videoRef.current.videoHeight;
      console.log(`Video metadata loaded: ${width}x${height}`);
      setResolution({
        width: width,
        height: height
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
    // Update detection interval when detection frequency or activeModel changes
    if (isStreaming && activeModel) {
      if (detectionIntervalRef.current) {
        clearInterval(detectionIntervalRef.current);
      }
      
      // Initial detection
      detectObjects();
      
      // Set frequent interval for more responsive object tracking
      detectionIntervalRef.current = window.setInterval(detectObjects, detectionFrequencyMs);
    }
    
    return () => {
      if (detectionIntervalRef.current) {
        clearInterval(detectionIntervalRef.current);
        detectionIntervalRef.current = null;
      }
    };
  }, [isStreaming, activeModel, detectObjects, detectionFrequencyMs]);

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
      
      if (detectionIntervalRef.current) {
        clearInterval(detectionIntervalRef.current);
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
  };
};
