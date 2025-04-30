import { useState, useEffect, useRef, useCallback } from 'react';
import { convertDavToMP4 } from '../utils/ffmpegUtils';
import { toast } from 'sonner';

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
  model?: string; // Add model field to track which model produced detection
}

interface VideoFeedProps {
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
  activeModels?: { name: string; path: string }[];
  streamType?: 'main' | 'sub';
  fps?: number;
}

export const useVideoFeed = ({ 
  initialVideoUrl = '', 
  autoStart = false,
  camera = undefined,
  activeModels = [],
  streamType = 'main',
  fps = 10
}: VideoFeedProps) => {
  const [videoUrl, setVideoUrl] = useState(initialVideoUrl || '');
  const [isStreaming, setIsStreaming] = useState(false);
  const [isPlaying, setIsPlaying] = useState(true);
  const [detections, setDetections] = useState<Detection[]>([]);
  const [resolution, setResolution] = useState({ width: 640, height: 480 });
  const [isProcessing, setIsProcessing] = useState(false);
  const [hasUploadedFile, setHasUploadedFile] = useState(false);
  const [originalFile, setOriginalFile] = useState<File | null>(null);
  const [inferenceLocation, setInferenceLocation] = useState<'edge' | 'server' | null>(null);
  const [inferenceTime, setInferenceTime] = useState<number | null>(null);
  const [actualFps, setActualFps] = useState<number | null>(null);
  const [isHikvisionFormat, setIsHikvisionFormat] = useState(false);
  const [isModelLoading, setIsModelLoading] = useState(false);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const frameCountRef = useRef<number>(0);
  const lastFrameTimeRef = useRef<number>(Date.now());
  const processingRef = useRef<boolean>(false);
  const requestAnimationFrameIdRef = useRef<number | null>(null);
  const activeModelsRef = useRef<{ name: string; path: string }[]>(activeModels);

  // Keep activeModelsRef in sync with activeModels prop
  useEffect(() => {
    activeModelsRef.current = activeModels;
    console.log('Active models updated:', activeModels);
  }, [activeModels]);

  // Initialize WebSocket connection
  const initWebSocket = useCallback(() => {
    try {
      // Close existing connection if any
      if (socketRef.current) {
        socketRef.current.close();
      }
      
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsHost = process.env.NODE_ENV === 'production' 
        ? window.location.host
        : window.location.host;
      
      const wsUrl = `${wsProtocol}//${wsHost}/ws/inference`;
      console.log(`Connecting to WebSocket at ${wsUrl}`);
      
      const socket = new WebSocket(wsUrl);
      
      socket.onopen = () => {
        console.log('WebSocket connection established');
      };
      
      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('WebSocket response received:', {
            status: data.status,
            clientId: data.clientId,
            detections: data.detections?.length || 0,
            modelResults: data.modelResults ? Object.keys(data.modelResults) : 'none'
          });
          
          if (data.detections) {
            console.log(`Received ${data.detections.length} detections from server`);
            
            // Format received detections - handle both flat array and per-model results
            let formattedDetections: Detection[] = [];
            
            // Handle case when detections is a flat array
            if (Array.isArray(data.detections)) {
              formattedDetections = data.detections.map((d: any) => ({
                id: d.id || `det-${Math.random().toString(36).substring(2, 9)}`,
                label: d.label || d.class_name || d.class || 'Unknown',
                confidence: d.confidence || 0,
                model: d.model || 'unknown',
                bbox: {
                  x1: typeof d.bbox === 'object' ? d.bbox.x1 : (d.x - d.width/2) || 0,
                  y1: typeof d.bbox === 'object' ? d.bbox.y1 : (d.y - d.height/2) || 0,
                  x2: typeof d.bbox === 'object' ? d.bbox.x2 : (d.x + d.width/2) || 0,
                  y2: typeof d.bbox === 'object' ? d.bbox.y2 : (d.y + d.height/2) || 0,
                  width: d.width || (typeof d.bbox === 'object' ? d.bbox.width : 0),
                  height: d.height || (typeof d.bbox === 'object' ? d.bbox.height : 0)
                }
              }));
              
              console.log(`Formatted ${formattedDetections.length} detections from flat array`);
              if (formattedDetections.length > 0) {
                console.log('Sample formatted detection:', formattedDetections[0]);
              }
            }
            
            // Check if we have model-specific results (this is the new format we want to support)
            if (data.modelResults) {
              console.log("Multi-model results found:", Object.keys(data.modelResults));
              
              // Process each model's results
              Object.entries(data.modelResults).forEach(([modelName, modelDetections]) => {
                if (Array.isArray(modelDetections)) {
                  console.log(`Processing ${(modelDetections as any[]).length} detections from model ${modelName}`);
                  
                  const modelFormattedDetections = (modelDetections as any[]).map((d: any) => ({
                    id: d.id || `${modelName}-${Math.random().toString(36).substring(2, 9)}`,
                    label: d.label || d.class_name || d.class || modelName,
                    confidence: d.confidence || 0,
                    model: modelName,
                    bbox: {
                      x1: typeof d.bbox === 'object' ? d.bbox.x1 : (d.x - d.width/2) || 0,
                      y1: typeof d.bbox === 'object' ? d.bbox.y1 : (d.y - d.height/2) || 0,
                      x2: typeof d.bbox === 'object' ? d.bbox.x2 : (d.x + d.width/2) || 0,
                      y2: typeof d.bbox === 'object' ? d.bbox.y2 : (d.y + d.height/2) || 0,
                      width: d.width || (typeof d.bbox === 'object' ? d.bbox.width : 0),
                      height: d.height || (typeof d.bbox === 'object' ? d.bbox.height : 0)
                    }
                  }));
                  
                  // Add this model's detections to the combined results
                  formattedDetections = [...formattedDetections, ...modelFormattedDetections];
                  
                  console.log(`Added ${modelFormattedDetections.length} detections from model ${modelName}`);
                  if (modelFormattedDetections.length > 0) {
                    console.log('Sample model detection:', modelFormattedDetections[0]);
                  }
                }
              });
            }
            
            // Set the combined detections from all models
            console.log(`Setting ${formattedDetections.length} total detections`);
            setDetections(formattedDetections);
            
            // Update inference stats
            if (data.inferenceTime) {
              setInferenceTime(data.inferenceTime);
            }
            
            // Set inference location
            if (data.processedAt) {
              setInferenceLocation(data.processedAt === 'edge' ? 'edge' : 'server');
            }
            
            // Release the processing lock
            processingRef.current = false;
          } else if (data.status === 'connected') {
            console.log('Connected to inference service with client ID:', data.clientId);
          } else if (data.error) {
            console.error('Inference error:', data.error);
            toast.error(`Inference error: ${data.error}`);
            processingRef.current = false;
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
          processingRef.current = false;
        }
      };
      
      socket.onclose = () => {
        console.log('WebSocket connection closed');
      };
      
      socket.onerror = (error) => {
        console.error('WebSocket error:', error);
        toast.error('Connection to inference service failed');
      };
      
      socketRef.current = socket;
    } catch (error) {
      console.error('Error initializing WebSocket:', error);
      toast.error('Failed to connect to inference service');
    }
  }, []);

  // Start sending frames for processing
  const startFrameProcessing = useCallback(() => {
    if (!videoRef.current || !socketRef.current || !isStreaming || processingRef.current) {
      console.log('Skipping frame processing:', {
        videoReady: !!videoRef.current,
        socketReady: !!socketRef.current,
        isStreaming,
        alreadyProcessing: processingRef.current
      });
      return;
    }
    
    // Get active models from ref to ensure we have latest
    const currentActiveModels = activeModelsRef.current;
    
    // Skip if no models are selected or if not playing
    if (currentActiveModels.length === 0 || !isPlaying) {
      console.log('No active models or video paused, skipping frame processing', {
        modelCount: currentActiveModels.length,
        isPlaying
      });
      if (requestAnimationFrameIdRef.current !== null) {
        cancelAnimationFrame(requestAnimationFrameIdRef.current);
        requestAnimationFrameIdRef.current = null;
      }
      return;
    }
    
    // Skip if the video is not properly loaded
    if (
      videoRef.current.readyState !== 4 || 
      videoRef.current.videoWidth === 0 || 
      videoRef.current.videoHeight === 0
    ) {
      console.log('Video not ready for frame processing', {
        readyState: videoRef.current.readyState,
        width: videoRef.current.videoWidth,
        height: videoRef.current.videoHeight
      });
      requestAnimationFrameIdRef.current = requestAnimationFrame(startFrameProcessing);
      return;
    }
    
    // Calculate FPS
    frameCountRef.current += 1;
    const now = Date.now();
    const elapsed = now - lastFrameTimeRef.current;
    
    if (elapsed >= 1000) {
      const calculatedFps = Math.round((frameCountRef.current * 1000) / elapsed);
      setActualFps(calculatedFps);
      frameCountRef.current = 0;
      lastFrameTimeRef.current = now;
    }
    
    // Only process frames at the specified FPS rate
    const frameInterval = 1000 / fps;
    const timeSinceLastFrame = now - lastFrameTimeRef.current;
    
    if (timeSinceLastFrame < frameInterval && frameCountRef.current > 0) {
      requestAnimationFrameIdRef.current = requestAnimationFrame(startFrameProcessing);
      return;
    }
    
    // Mark as processing to prevent multiple concurrent frames
    processingRef.current = true;
    
    try {
      // Create canvas for grabbing video frame
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        console.error('Failed to get canvas context');
        processingRef.current = false;
        requestAnimationFrameIdRef.current = requestAnimationFrame(startFrameProcessing);
        return;
      }
      
      // Draw the current video frame to the canvas
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      
      // Get the image data as a Base64 string
      const imageData = canvas.toDataURL('image/jpeg', 0.7);
      
      // Get the model paths from the active models
      const modelPaths = currentActiveModels.map(model => model.path);
      
      // Skip if no models are selected
      if (modelPaths.length === 0) {
        processingRef.current = false;
        requestAnimationFrameIdRef.current = requestAnimationFrame(startFrameProcessing);
        return;
      }
      
      // Log what models we're sending for detection
      console.log(`Sending frame for inference with models: ${currentActiveModels.map(m => m.name).join(', ')}`);
      console.log('Model paths:', modelPaths);
      
      // Send the frame for processing
      socketRef.current.send(JSON.stringify({
        modelPaths: modelPaths,
        imageData: imageData,
        threshold: 0.5
      }));
    } catch (error) {
      console.error('Error processing frame:', error);
      processingRef.current = false;
    }
    
    // Schedule next frame
    requestAnimationFrameIdRef.current = requestAnimationFrame(startFrameProcessing);
  }, [isStreaming, isPlaying, fps]);

  // Start streaming video
  const startStream = useCallback(async () => {
    if (!videoUrl && !hasUploadedFile) {
      toast.error('Please enter a video URL or upload a file');
      return;
    }
    
    // Reset state
    setDetections([]);
    setInferenceLocation(null);
    setInferenceTime(null);
    
    // Handle Hikvision DAV format for uploaded files
    if (hasUploadedFile && originalFile && originalFile.name.endsWith('.dav')) {
      setIsProcessing(true);
      setIsHikvisionFormat(true);
      
      try {
        // Convert DAV to MP4
        const mp4Url = await convertDavToMP4(originalFile);
        setVideoUrl(mp4Url);
        
        // Model loading can proceed in parallel with conversion
        if (activeModelsRef.current.length > 0) {
          setIsModelLoading(true);
        }
        
        // Initialize WebSocket connection
        initWebSocket();
        
        // Start streaming
        setIsStreaming(true);
        setIsPlaying(true);
      } catch (error) {
        console.error('Error converting DAV file:', error);
        toast.error('Failed to convert Hikvision DAV file');
      } finally {
        setIsProcessing(false);
        setIsModelLoading(false);
      }
    } else {
      // Standard video streaming
      if (activeModelsRef.current.length > 0) {
        setIsModelLoading(true);
        
        // Simulate model loading time
        setTimeout(() => {
          setIsModelLoading(false);
        }, 1500);
      }
      
      // Initialize WebSocket connection
      initWebSocket();
      
      // Start streaming
      setIsStreaming(true);
      setIsPlaying(true);
    }
  }, [videoUrl, hasUploadedFile, originalFile, initWebSocket]);

  // Stop streaming
  const stopStream = useCallback(() => {
    setIsStreaming(false);
    setIsPlaying(false);
    setDetections([]);
    setInferenceLocation(null);
    setInferenceTime(null);
    setActualFps(null);
    
    // Cancel any pending animation frame
    if (requestAnimationFrameIdRef.current !== null) {
      cancelAnimationFrame(requestAnimationFrameIdRef.current);
      requestAnimationFrameIdRef.current = null;
    }
    
    // Close WebSocket connection
    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }
  }, []);

  // Toggle play/pause
  const togglePlayPause = useCallback(() => {
    if (!videoRef.current) return;
    
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current.play();
      setIsPlaying(true);
    }
  }, [isPlaying]);

  // Handle file upload
  const handleFileUpload = useCallback(async (file: File) => {
    setOriginalFile(file);
    setHasUploadedFile(true);
    
    // Check if it's a Hikvision DAV file
    if (file.name.endsWith('.dav')) {
      setIsHikvisionFormat(true);
      setVideoUrl('');  // Clear URL as we'll replace it after conversion
    } else {
      // Regular video file
      setIsHikvisionFormat(false);
      setVideoUrl(URL.createObjectURL(file));
    }
    
    // Stop any existing stream
    if (isStreaming) {
      stopStream();
    }
  }, [isStreaming, stopStream]);

  // Handle video metadata loaded event
  const handleVideoMetadata = useCallback((e: React.SyntheticEvent<HTMLVideoElement>) => {
    const video = e.target as HTMLVideoElement;
    setResolution({
      width: video.videoWidth,
      height: video.videoHeight
    });
  }, []);

  // Handle video error
  const handleVideoError = useCallback((e: React.SyntheticEvent<HTMLVideoElement>) => {
    console.error('Video error:', e);
    toast.error('Failed to load video');
    stopStream();
  }, [stopStream]);

  // Auto-start if requested
  useEffect(() => {
    if (autoStart && (initialVideoUrl || camera)) {
      // If camera is provided, use its stream URL
      if (camera) {
        setVideoUrl(camera.streamUrl[streamType]);
      }
      
      // Start after a short delay to allow setup
      const timer = setTimeout(() => {
        startStream();
      }, 500);
      
      return () => clearTimeout(timer);
    }
  }, [autoStart, initialVideoUrl, camera, streamType, startStream]);

  // Start/stop frame processing based on streaming state
  useEffect(() => {
    if (isStreaming && isPlaying) {
      console.log('Starting frame processing loop with active models:', activeModelsRef.current);
      startFrameProcessing();
    } else if (requestAnimationFrameIdRef.current !== null) {
      console.log('Stopping frame processing loop');
      cancelAnimationFrame(requestAnimationFrameIdRef.current);
      requestAnimationFrameIdRef.current = null;
    }
    
    return () => {
      if (requestAnimationFrameIdRef.current !== null) {
        console.log('Cleaning up frame processing on component unmount');
        cancelAnimationFrame(requestAnimationFrameIdRef.current);
        requestAnimationFrameIdRef.current = null;
      }
    };
  }, [isStreaming, isPlaying, startFrameProcessing]);

  // Clean up resources on unmount
  useEffect(() => {
    return () => {
      if (socketRef.current) {
        socketRef.current.close();
      }
      
      if (requestAnimationFrameIdRef.current !== null) {
        cancelAnimationFrame(requestAnimationFrameIdRef.current);
      }
    };
  }, []);

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
