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
  fps?: number;
}

export const useVideoFeed = ({
  initialVideoUrl = '',
  autoStart = false,
  camera,
  activeModel,
  streamType = 'main',
  fps = 10 // Default to 10 frames per second for detection
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
  const [actualFps, setActualFps] = useState<number | null>(null);
  const [droppedFrames, setDroppedFrames] = useState(0);
  const [consecutiveErrors, setConsecutiveErrors] = useState(0);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const lastDetectionTimeRef = useRef<number>(0);
  const frameCountRef = useRef<number>(0);
  const droppedFrameCountRef = useRef<number>(0);
  const lastFpsUpdateTimeRef = useRef<number>(0);
  const detectionInProgressRef = useRef<boolean>(false);
  const consecutiveErrorsRef = useRef<number>(0);
  
  // Calculate time between frames based on FPS
  const frameIntervalMs = 1000 / fps;

  // Optimize performance settings based on device capabilities
  useEffect(() => {
    // Configure EdgeAIInference for performance
    EdgeAIInference.setPerformanceSettings({
      maxPendingRequests: 2,  // Allow 2 concurrent requests
      minRequestInterval: Math.floor(frameIntervalMs), // Based on desired FPS
      useQuantized: true      // Enable quantized models if available
    });
  }, [fps, frameIntervalMs]);

  const detectObjects = useCallback(async () => {
    if (!activeModel && !camera) {
      setDetections([]);
      return;
    }
    
    // Skip if detection already in progress
    if (detectionInProgressRef.current) {
      droppedFrameCountRef.current++;
      return;
    }
    
    try {
      const modelToUse = activeModel;
      
      if (!videoRef.current || videoRef.current.paused) {
        console.log("Video is paused or not available for detection");
        return;
      }
      
      // Rate limiting based on specified FPS
      const now = Date.now();
      if (now - lastDetectionTimeRef.current < frameIntervalMs) {
        droppedFrameCountRef.current++;
        return;
      }
      lastDetectionTimeRef.current = now;
      
      // For FPS calculation
      frameCountRef.current++;
      if (now - lastFpsUpdateTimeRef.current >= 1000) {
        setActualFps(frameCountRef.current);
        setDroppedFrames(droppedFrameCountRef.current);
        frameCountRef.current = 0;
        droppedFrameCountRef.current = 0;
        lastFpsUpdateTimeRef.current = now;
      }
      
      // Mark detection as started
      detectionInProgressRef.current = true;
      
      try {
        if (!canvasRef.current) {
          const canvas = document.createElement('canvas');
          canvas.width = videoRef.current.videoWidth || 640;
          canvas.height = videoRef.current.videoHeight || 360;
          canvasRef.current = canvas;
        }
        
        const ctx = canvasRef.current.getContext('2d', { 
          alpha: false,  // Optimization: disable alpha channel
          willReadFrequently: true // Optimization: optimize for frequent readback
        });
        
        if (ctx && videoRef.current) {
          // Ensure canvas matches video dimensions exactly
          canvasRef.current.width = videoRef.current.videoWidth || 640;
          canvasRef.current.height = videoRef.current.videoHeight || 360;
          
          // Draw the current video frame to the canvas
          ctx.drawImage(videoRef.current, 0, 0, canvasRef.current.width, canvasRef.current.height);
          
          // Use lower JPEG quality to reduce payload size
          const imageData = canvasRef.current.toDataURL('image/jpeg', 0.7);
          
          if (!modelToUse) {
            console.warn("No model specified for inference");
            detectionInProgressRef.current = false;
            return;
          }
          
          const request = {
            imageData: imageData,
            cameraId: camera?.id || videoUrl || "unknown",
            modelName: modelToUse.name || "custom_model",
            modelPath: modelToUse.path || "",
            thresholdConfidence: 0.5
          };
          
          const result = await EdgeAIInference.performInference(request);
          
          // Reset consecutive errors on success
          consecutiveErrorsRef.current = 0;
          
          if (result.detections && result.detections.length > 0) {
            // Create normalized detections with unique IDs
            const normalizedDetections = result.detections.map((detection: BackendDetection, index) => {
              // Create a unique ID for React
              const uniqueId = `${index}-${Date.now()}`;
              
              // Get detection properties with proper defaults
              const processedDetection: Detection = {
                id: uniqueId,
                label: detection.label || detection.class || 'Object',
                class: detection.class || detection.label || 'Object',
                confidence: detection.confidence || 0
              };
              
              // Handle YOLO-style center+dimensions format (keep as is)
              if (detection.x !== undefined && detection.y !== undefined && 
                  detection.width !== undefined && detection.height !== undefined) {
                processedDetection.x = detection.x;
                processedDetection.y = detection.y;
                processedDetection.width = detection.width;
                processedDetection.height = detection.height;
              }
              
              // Process bbox coordinates if available [x1, y1, x2, y2]
              if (Array.isArray(detection.bbox) && detection.bbox.length === 4) {
                processedDetection.bbox = [...detection.bbox];
                
                // Ensure all values are valid numbers
                processedDetection.bbox = processedDetection.bbox.map(val => 
                  isNaN(val) ? 0 : val
                );
                
                // Ensure coordinates are properly ordered (x1 < x2, y1 < y2)
                if (processedDetection.bbox[2] < processedDetection.bbox[0]) {
                  [processedDetection.bbox[0], processedDetection.bbox[2]] = 
                    [processedDetection.bbox[2], processedDetection.bbox[0]];
                }
                if (processedDetection.bbox[3] < processedDetection.bbox[1]) {
                  [processedDetection.bbox[1], processedDetection.bbox[3]] = 
                    [processedDetection.bbox[3], processedDetection.bbox[1]];
                }
                
                // If we don't have center coordinates but have bbox, calculate center coords
                if (processedDetection.x === undefined) {
                  const [x1, y1, x2, y2] = processedDetection.bbox;
                  processedDetection.x = (x1 + x2) / 2;
                  processedDetection.y = (y1 + y2) / 2;
                  processedDetection.width = x2 - x1;
                  processedDetection.height = y2 - y1;
                }
              } 
              // If no valid bbox data but we have center coords, calculate bbox
              else if (processedDetection.x !== undefined && processedDetection.bbox === undefined) {
                const halfWidth = processedDetection.width! / 2;
                const halfHeight = processedDetection.height! / 2;
                
                processedDetection.bbox = [
                  processedDetection.x - halfWidth,    // x1
                  processedDetection.y - halfHeight,   // y1
                  processedDetection.x + halfWidth,    // x2
                  processedDetection.y + halfHeight    // y2
                ];
              }
              
              return processedDetection;
            });
            
            // Filter out detections with very low confidence
            const filteredDetections = normalizedDetections.filter(d => 
              d.confidence > 0.1 // Lower threshold to show more detections for debugging
            );
            
            setDetections(filteredDetections);
            setInferenceLocation(result.processedAt);
            setInferenceTime(result.inferenceTime);
            
            // Dispatch detection event for other components
            window.dispatchEvent(new CustomEvent('ai-detection', { 
              detail: { 
                detections: filteredDetections,
                modelName: request.modelName,
                timestamp: new Date(),
                source: camera?.id || "video-feed" 
              } 
            }));
          } else {
            setDetections([]);
          }
          
        }
      } catch (error) {
        // Skip errors related to frame dropping - those are expected
        if (error.message && (
            error.message.includes('Frame dropped') || 
            error.message.includes('Too many pending requests'))) {
          droppedFrameCountRef.current++;
        } else {
          // Increment consecutive errors
          consecutiveErrorsRef.current++;
          setConsecutiveErrors(consecutiveErrorsRef.current);
          
          console.error("Edge inference error:", error);
          
          // Only show toast after multiple consecutive errors
          if (consecutiveErrorsRef.current >= 5) {
            toast.error("AI inference failed", {
              description: "Check if the Edge Computing node is running and the model is valid"
            });
            setInferenceLocation("server");
            consecutiveErrorsRef.current = 0; // Reset after showing toast
          }
          
          setDetections([]);
        }
      } finally {
        // Mark detection as finished
        detectionInProgressRef.current = false;
      }
    } catch (error) {
      console.error("Detection wrapper error:", error);
      detectionInProgressRef.current = false;
    }
  }, [activeModel, camera, videoUrl, fps, frameIntervalMs]);

  const scheduleNextDetection = useCallback(() => {
    if (!isStreaming || !isPlaying) return;
    
    // Use requestAnimationFrame for smoother timing
    animationFrameRef.current = requestAnimationFrame(() => {
      detectObjects()
        .finally(() => {
          // Schedule next detection
          scheduleNextDetection();
        });
    });
  }, [detectObjects, isPlaying, isStreaming]);

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
      // Cancel any existing animation frame
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      
      // Reset FPS tracking
      frameCountRef.current = 0;
      droppedFrameCountRef.current = 0;
      lastFpsUpdateTimeRef.current = Date.now();
      consecutiveErrorsRef.current = 0;
      
      // Start detection loop using requestAnimationFrame
      scheduleNextDetection();
    }
  };

  const stopStream = () => {
    setIsStreaming(false);
    setDetections([]);
    setIsPlaying(false);
    setActualFps(null);
    setDroppedFrames(0);
    setConsecutiveErrors(0);
    
    // Cancel animation frame if active
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
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
    // Update detection when activeModel changes
    if (isStreaming && activeModel && isPlaying) {
      // Cancel any existing animation frame
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      
      // Reset FPS tracking
      frameCountRef.current = 0;
      droppedFrameCountRef.current = 0;
      lastFpsUpdateTimeRef.current = Date.now();
      
      // Start detection loop using requestAnimationFrame
      scheduleNextDetection();
    }
    
    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [isStreaming, activeModel, isPlaying, scheduleNextDetection]);

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
      
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
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
    actualFps,
    droppedFrames,
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
