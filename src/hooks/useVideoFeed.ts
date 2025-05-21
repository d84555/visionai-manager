import { useState, useEffect, useRef, useCallback } from 'react';
import { convertToPlayableFormat, detectVideoFormat, createHlsStream } from '../utils/ffmpegUtils';
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
  enableHLS?: boolean; // Added parameter to control HLS playback
}

export const useVideoFeed = ({ 
  initialVideoUrl = '', 
  autoStart = false,
  camera = undefined,
  activeModels = [],
  streamType = 'main',
  fps = 10,
  enableHLS = true // Default to true for HLS support
}: VideoFeedProps) => {
  // State variables
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
  const [isTranscoding, setIsTranscoding] = useState(false);
  const [formatNotSupported, setFormatNotSupported] = useState(false);
  const [isLiveStream, setIsLiveStream] = useState(false);
  const [streamProcessing, setStreamProcessing] = useState(false);
  
  // Add enableHLS state to expose it
  const [hlsEnabled, setHlsEnabled] = useState<boolean>(enableHLS);

  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const frameCountRef = useRef<number>(0);
  const lastFrameTimeRef = useRef<number>(Date.now());
  const processingRef = useRef<boolean>(false);
  const requestAnimationFrameIdRef = useRef<number | null>(null);
  const activeModelsRef = useRef<{ name: string; path: string }[]>(activeModels);
  const retryConnectionRef = useRef<boolean>(false);
  const connectionAttemptsRef = useRef<number>(0);
  const maxConnectionAttempts = 5;

  // Keep activeModelsRef in sync with activeModels prop
  useEffect(() => {
    activeModelsRef.current = activeModels;
    console.log('Active models updated:', activeModels);
  }, [activeModels]);

  // Define stopStream function before it's used
  const stopStream = useCallback(() => {
    // Signal not to attempt reconnection
    if (socketRef.current) {
      retryConnectionRef.current = true;
    }
    
    setIsStreaming(false);
    setIsPlaying(false);
    setDetections([]);
    setInferenceLocation(null);
    setInferenceTime(null);
    setActualFps(null);
    setFormatNotSupported(false);
    setIsLiveStream(false);
    
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
    
    // Reset connection attempts
    connectionAttemptsRef.current = 0;
  }, []);

  // Initialize WebSocket connection with retry logic
  const initWebSocket = useCallback(() => {
    try {
      // Close existing connection if any
      if (socketRef.current) {
        socketRef.current.close();
      }
      
      // Reset retry flag
      retryConnectionRef.current = false;
      
      // Use relative WebSocket URL to work with the proxy
      const wsUrl = '/ws/inference';
      console.log(`Connecting to WebSocket at ${wsUrl}`);
      
      const socket = new WebSocket(`${window.location.protocol === 'https:' ? 'wss://' : 'ws://'}${window.location.host}${wsUrl}`);
      
      socket.onopen = () => {
        console.log('WebSocket connection established');
        // Reset connection attempts on successful connection
        connectionAttemptsRef.current = 0;
        
        // Send a ping message to test connection
        socket.send(JSON.stringify({
          type: 'ping',
          message: 'Testing connection'
        }));
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
            }
            
            // Check if we have model-specific results
            if (data.modelResults) {
              Object.entries(data.modelResults).forEach(([modelName, modelDetections]) => {
                if (Array.isArray(modelDetections)) {
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
                }
              });
            }
            
            // Set the combined detections from all models
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
      
      socket.onclose = (event) => {
        console.log(`WebSocket connection closed with code ${event.code}`);
        
        // Only attempt reconnection if we're still streaming
        if (isStreaming) {
          // Attempt reconnection if not intentionally closed
          if (event.code !== 1000 && !retryConnectionRef.current && connectionAttemptsRef.current < maxConnectionAttempts) {
            console.log('WebSocket connection lost, attempting to reconnect...');
            connectionAttemptsRef.current++;
            
            // Exponential backoff with jitter for reconnection attempts
            const baseDelay = 1000; // 1 second
            const maxDelay = 10000; // 10 seconds max
            const delay = Math.min(baseDelay * Math.pow(1.5, connectionAttemptsRef.current), maxDelay);
            const jitter = delay * 0.2 * Math.random(); // Add up to 20% random jitter
            
            console.log(`Attempting reconnection in ${Math.round((delay + jitter)/1000)} seconds (attempt ${connectionAttemptsRef.current})`);
            
            setTimeout(() => {
              if (isStreaming) {
                initWebSocket();
              }
            }, delay + jitter);
          } else if (connectionAttemptsRef.current >= maxConnectionAttempts) {
            console.log('Maximum reconnection attempts reached, giving up');
            toast.error('Connection to inference service lost', {
              description: 'Failed to reconnect after multiple attempts'
            });
          }
        }
      };
      
      socket.onerror = (error) => {
        console.error('WebSocket error:', error);
        // Don't show toast here, we'll handle retries in onclose
      };
      
      socketRef.current = socket;
    } catch (error) {
      console.error('Error initializing WebSocket:', error);
      toast.error('Failed to connect to inference service');
    }
  }, [isStreaming, maxConnectionAttempts]);

  // Start sending frames for processing
  const startFrameProcessing = useCallback(() => {
    if (!videoRef.current || !socketRef.current || !isStreaming || processingRef.current) {
      requestAnimationFrameIdRef.current = requestAnimationFrame(startFrameProcessing);
      return;
    }
    
    // Get active models from ref to ensure we have latest
    const currentActiveModels = activeModelsRef.current;
    
    // Skip if no models are selected or if not playing
    if (currentActiveModels.length === 0 || !isPlaying) {
      if (requestAnimationFrameIdRef.current !== null) {
        cancelAnimationFrame(requestAnimationFrameIdRef.current);
        requestAnimationFrameIdRef.current = null;
      }
      return;
    }
    
    // Enhanced video readiness check
    if (
      !videoRef.current || 
      videoRef.current.readyState < 2 || // HAVE_CURRENT_DATA or higher
      videoRef.current.videoWidth === 0 || 
      videoRef.current.videoHeight === 0 ||
      videoRef.current.paused
    ) {
      // Add a force play attempt if video is paused
      if (videoRef.current && videoRef.current.paused && isPlaying) {
        videoRef.current.play().catch(err => {
          console.error('Error forcing video to play:', err);
        });
      }
      
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
      
      // Add timestamp for debugging
      const timestamp = new Date().toISOString();
      
      // Send the frame for processing
      socketRef.current.send(JSON.stringify({
        modelPaths: modelPaths,
        imageData: imageData,
        threshold: 0.5,
        timestamp: timestamp
      }));
    } catch (error) {
      console.error('Error processing frame:', error);
      processingRef.current = false;
    }
    
    // Schedule next frame
    requestAnimationFrameIdRef.current = requestAnimationFrame(startFrameProcessing);
  }, [isStreaming, isPlaying, fps]);

  // Process RTSP stream
  const processRtspStream = useCallback(async (url: string) => {
    try {
      setStreamProcessing(true);
      setIsLiveStream(true);
      
      // Use FFmpeg to convert RTSP to HLS
      const streamUrl = await createHlsStream(url, `camera_${Date.now()}`);
      console.log('Stream URL received:', streamUrl);
      
      // Ensure we're using the correct relative URL for the stream
      console.log('Using relative stream URL:', streamUrl);
      
      setVideoUrl(streamUrl);
      setStreamProcessing(false);
      
      return streamUrl;
    } catch (error) {
      console.error('Failed to process RTSP stream:', error);
      toast.error('Failed to process camera stream', {
        description: 'Please check that the camera URL is correct and accessible'
      });
      setStreamProcessing(false);
      throw error;
    }
  }, []);

  // Check if URL is RTSP or other streaming format
  const isStreamingUrl = (url: string): boolean => {
    return url.startsWith('rtsp://') || 
           url.startsWith('rtsps://') ||
           url.startsWith('rtmp://') ||
           url.includes('.m3u8') ||
           url.startsWith('http://') && (url.includes('.m3u8') || url.includes('mjpg/video') || url.includes('mjpeg'));
  };

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
    setFormatNotSupported(false);
    
    // Handle RTSP or other streaming URLs
    if (videoUrl && isStreamingUrl(videoUrl)) {
      setIsProcessing(true);
      
      try {
        // If it's an RTSP URL, process it
        if (videoUrl.startsWith('rtsp://') || videoUrl.startsWith('rtsps://') || videoUrl.startsWith('rtmp://')) {
          const processedUrl = await processRtspStream(videoUrl);
          
          // Model loading can proceed in parallel
          if (activeModelsRef.current.length > 0) {
            setIsModelLoading(true);
            setTimeout(() => { setIsModelLoading(false); }, 1500);
          }
          
          // Initialize WebSocket connection
          initWebSocket();
          
          // Start streaming
          setIsStreaming(true);
          setIsPlaying(true);
          setIsProcessing(false);
          
          return;
        }
      } catch (error) {
        console.error('Error processing stream:', error);
        setIsProcessing(false);
        return;
      }
    }
    
    // Initialize WebSocket connection for any type of video
    initWebSocket();
      
    // Start streaming
    setIsStreaming(true);
    setIsPlaying(true);
    
    // Ensure video element plays
    if (videoRef.current) {
      try {
        console.log('Attempting to play video...');
        
        // Add a small delay to ensure the video element has loaded properly
        setTimeout(() => {
          if (videoRef.current) {
            const playPromise = videoRef.current.play();
            
            if (playPromise !== undefined) {
              playPromise.then(() => {
                console.log('Video playback started successfully');
              }).catch(error => {
                console.error('Error forcing video to play:', error);
                
                // Handle unsupported format
                if (error.name === 'NotSupportedError') {
                  toast.error('Video format not supported', {
                    description: 'This video format cannot be played in your browser. Please enable server-side transcoding in Settings.'
                  });
                  setFormatNotSupported(true);
                  stopStream();
                } else {
                  toast.error('Video playback failed. This may be due to browser autoplay policies.');
                }
              });
            }
          }
        }, 500);
      } catch (error) {
        console.error('Error playing video:', error);
      }
    }
  }, [videoUrl, hasUploadedFile, initWebSocket, processRtspStream, isStreamingUrl, stopStream]);

  // Toggle play/pause
  const togglePlayPause = useCallback(() => {
    if (!videoRef.current) return;
    
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current.play().catch(err => {
        console.error('Error forcing video to play:', err);
        if (err.name === 'NotSupportedError') {
          toast.error('Video format not supported', {
            description: 'This video format cannot be played in your browser. Please enable server-side transcoding in Settings.'
          });
          setFormatNotSupported(true);
        }
      });
      setIsPlaying(true);
    }
  }, [isPlaying]);

  // Handle file upload
  const handleFileUpload = useCallback(async (file: File) => {
    setOriginalFile(file);
    setHasUploadedFile(true);
    setIsLiveStream(false);
    setVideoUrl(''); // Clear existing URL while processing
    
    // Check file format
    const formatInfo = detectVideoFormat(file);
    setIsHikvisionFormat(formatInfo.isHikvision || false);
    
    // Always process the file through convertToPlayableFormat
    // This ensures browser compatibility regardless of what the detectVideoFormat returns
    setIsProcessing(true);
    try {
      toast.info('Processing video file', {
        description: 'Converting to web-compatible format...'
      });
      
      const playableUrl = await convertToPlayableFormat(file);
      setVideoUrl(playableUrl);
      
      // Stop any existing stream
      if (isStreaming) {
        stopStream();
      }
    } catch (error) {
      console.error('Error processing uploaded video:', error);
      toast.error('Failed to process video', {
        description: 'The file format may not be supported. Please try a different format or use server transcoding.'
      });
      setFormatNotSupported(true);
    } finally {
      setIsProcessing(false);
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
    const video = e.target as HTMLVideoElement;
    console.error('Video error:', e, video.error);
    
    if (video.error) {
      // Check specific error codes
      switch (video.error.code) {
        case MediaError.MEDIA_ERR_ABORTED:
          toast.error('Video playback aborted');
          break;
        case MediaError.MEDIA_ERR_NETWORK:
          toast.error('Network error while loading video', {
            description: 'Make sure the video URL or camera is accessible'
          });
          break;
        case MediaError.MEDIA_ERR_DECODE:
          toast.error('Video decode error', {
            description: 'The video format may not be supported. Try enabling server-side transcoding in settings.'
          });
          setFormatNotSupported(true);
          break;
        case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
          toast.error('Video format not supported', {
            description: 'This video format cannot be played in your browser. Please use server-side transcoding or upload a compatible format like MP4.'
          });
          setFormatNotSupported(true);
          break;
        default:
          toast.error('Failed to load video');
      }
    } else {
      toast.error('Failed to load video');
    }
    
    stopStream();
  }, [stopStream]);

  // Auto-start if requested
  useEffect(() => {
    if (autoStart && (initialVideoUrl || camera)) {
      // If camera is provided, use its stream URL
      if (camera && camera.streamUrl) {
        // Add null check before accessing streamType
        if (camera.streamUrl[streamType]) {
          setVideoUrl(camera.streamUrl[streamType]);
        } else {
          // Fallback to main stream if requested stream type doesn't exist
          if (camera.streamUrl.main) {
            setVideoUrl(camera.streamUrl.main);
            console.log(`Stream type ${streamType} not available, falling back to main stream`);
          } else {
            console.error(`No stream URL available for camera ${camera.id}`);
            toast.error(`No stream URL available for camera ${camera.name || camera.id}`);
            return;
          }
        }
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
    if (isStreaming && isPlaying && !formatNotSupported) {
      console.log('Starting frame processing loop with active models:', activeModelsRef.current);
      
      // Short delay to ensure video has time to initialize
      const timer = setTimeout(() => {
        startFrameProcessing();
      }, 500);
      
      return () => {
        clearTimeout(timer);
        if (requestAnimationFrameIdRef.current !== null) {
          cancelAnimationFrame(requestAnimationFrameIdRef.current);
          requestAnimationFrameIdRef.current = null;
        }
      };
    } else if (requestAnimationFrameIdRef.current !== null) {
      console.log('Stopping frame processing loop');
      cancelAnimationFrame(requestAnimationFrameIdRef.current);
      requestAnimationFrameIdRef.current = null;
    }
  }, [isStreaming, isPlaying, formatNotSupported, startFrameProcessing]);

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
    enableHLS: hlsEnabled, // Expose HLS enabled state
    setHlsEnabled // Expose setter for HLS state
  };
};
