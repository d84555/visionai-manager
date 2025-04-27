import { useState, useRef, useEffect } from 'react';
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

  const detectObjects = async () => {
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
      
      if (!canvasRef.current) {
        const canvas = document.createElement('canvas');
        canvas.width = videoRef.current.videoWidth || 640;
        canvas.height = videoRef.current.videoHeight || 360;
        canvasRef.current = canvas;
      }
      
      const ctx = canvasRef.current.getContext('2d');
      if (ctx && videoRef.current) {
        canvasRef.current.width = videoRef.current.videoWidth || 640;
        canvasRef.current.height = videoRef.current.videoHeight || 360;
        ctx.drawImage(videoRef.current, 0, 0, canvasRef.current.width, canvasRef.current.height);
        
        const imageData = canvasRef.current.toDataURL('image/jpeg', 0.8);
        
        if (!modelToUse) {
          console.warn("No model specified for inference");
          return;
        }
        
        console.log(`Using model: ${modelToUse.name}, path: ${modelToUse.path}`);
        
        let customModelUrl = null;
        if (modelToUse.path.includes('/custom_models/')) {
          customModelUrl = SettingsService.getModelFileUrl(modelToUse.path);
          if (customModelUrl) {
            console.log(`Using custom model from Blob URL: ${customModelUrl}`);
          } else {
            console.warn(`Could not find Blob URL for custom model: ${modelToUse.path}`);
            
            if (modelToUse.path.includes('coverall.onnx')) {
              const testModel = SettingsService.createTestModel(modelToUse.name, modelToUse.path);
              customModelUrl = SettingsService.getModelFileUrl(testModel.path);
              console.log(`Created test model with URL: ${customModelUrl}`);
            }
          }
        }
        
        const request = {
          imageData: imageData,
          cameraId: camera?.id || videoUrl || "unknown",
          modelName: modelToUse.name || "custom_model",
          modelPath: modelToUse.path || "",
          customModelUrl: customModelUrl,
          thresholdConfidence: 0.5
        };
        
        console.log(`Performing inference with model: ${request.modelName}`);
        const result = await EdgeAIInference.performInference(request);
        
        if (result.detections.length > 0) {
          console.log(`Detected ${result.detections.length} objects with model ${request.modelName}`);
          console.log(`First detection: ${result.detections[0].label} with confidence ${result.detections[0].confidence}`);
        }
        
        const normalizedDetections = result.detections.map((detection: BackendDetection, index) => ({
          id: `${index}-${Date.now()}`,
          class: detection.label,
          confidence: detection.confidence,
          x: detection.bbox[0] * canvasRef.current!.width,
          y: detection.bbox[1] * canvasRef.current!.height,
          width: (detection.bbox[2] - detection.bbox[0]) * canvasRef.current!.width,
          height: (detection.bbox[3] - detection.bbox[1]) * canvasRef.current!.height
        }));
        
        setDetections(normalizedDetections);
        setInferenceLocation(result.processedAt);
        setInferenceTime(result.inferenceTime);
        
        if (!autoStart && result.detections.length > 0) {
          const highConfDetection = result.detections.find(d => d.confidence > 0.85);
          if (highConfDetection) {
            toast.warning(`High confidence detection: ${highConfDetection.label}`, {
              description: `Confidence: ${(highConfDetection.confidence * 100).toFixed(1)}%`
            });
          }
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
  };

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
        const modelUrl = SettingsService.getModelFileUrl(activeModel.path);
        if (modelUrl) {
          console.log(`Custom model found at Blob URL: ${modelUrl}`);
          await new Promise(resolve => setTimeout(resolve, 500));
        } else {
          console.warn(`No Blob URL found for custom model: ${activeModel.path}`);
          
          if (activeModel.path.includes('coverall.onnx')) {
            const testModel = SettingsService.createTestModel(activeModel.name, activeModel.path);
            const newUrl = SettingsService.getModelFileUrl(testModel.path);
            console.log(`Created test model with URL: ${newUrl}`);
          }
          
          toast.warning("Custom model file not found", {
            description: "Creating a test model for demonstration purposes"
          });
        }
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
