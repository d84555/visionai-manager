
import { useState, useEffect, useRef, useCallback } from 'react';
import { convertToPlayableFormat, detectVideoFormat, createHlsStream, stopHlsStream, isInternalStreamUrl, monitorHlsStream, createWebSocketWithReconnect } from '../utils/ffmpegUtils';
import { toast } from 'sonner';

// Import any types required
import type { SyntheticEvent } from 'react';
import { InferenceLocationType } from '../components/video/VideoControls';

interface UseVideoFeedOptions {
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

export const useVideoFeed = (options: UseVideoFeedOptions = {}) => {
  // Extract options with defaults
  const {
    initialVideoUrl = '',
    autoStart = false,
    camera = null,
    activeModels = [],
    streamType = 'main',
    fps = 10
  } = options;

  // State for video playback
  const [videoUrl, setVideoUrl] = useState<string>(initialVideoUrl);
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [resolution, setResolution] = useState<{ width: number; height: number }>({
    width: 640,
    height: 360
  });
  const [hasUploadedFile, setHasUploadedFile] = useState<boolean>(false);
  const [originalFile, setOriginalFile] = useState<File | null>(null);
  const [isHikvisionFormat, setIsHikvisionFormat] = useState<boolean>(false);
  const [detections, setDetections] = useState<any[]>([]);
  const [inferenceLocation, setInferenceLocation] = useState<InferenceLocationType>(null);
  const [inferenceTime, setInferenceTime] = useState<number | null>(null);
  const [actualFps, setActualFps] = useState<number | null>(null);
  const [socketConnectionId, setSocketConnectionId] = useState<string | null>(null);
  const [isModelLoading, setIsModelLoading] = useState<boolean>(false);
  const [isTranscoding, setIsTranscoding] = useState<boolean>(false);
  const [formatNotSupported, setFormatNotSupported] = useState<boolean>(false);
  const [isLiveStream, setIsLiveStream] = useState<boolean>(false);
  const [streamProcessing, setStreamProcessing] = useState<boolean>(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [isStreamingUrl, setIsStreamingUrl] = useState<boolean>(false);
  const [streamMonitor, setStreamMonitor] = useState<(() => void) | null>(null);

  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const wsHelperRef = useRef<{close: () => void} | null>(null);
  const isWSConnectingRef = useRef<boolean>(false);
  const activeFrameRequestRef = useRef<number | null>(null);
  const isStreamingRef = useRef<boolean>(false);
  const startTimeRef = useRef<number | null>(null);
  const frameCountRef = useRef<number>(0);
  const lastFpsUpdateRef = useRef<number>(0);

  // Helper function to determine if a URL is an RTSP URL
  const isRtspUrl = useCallback((url: string) => {
    return url.toLowerCase().startsWith('rtsp://') || 
           url.toLowerCase().startsWith('rtsps://') || 
           url.toLowerCase().startsWith('rtmp://');
  }, []);

  // Create a function to process RTSP streams
  const processRtspStream = useCallback(async (url: string) => {
    try {
      setStreamProcessing(true);
      setStreamError(null);
      
      // Check if this stream is already in HLS format (our own stream or external HLS)
      if (url.endsWith('.m3u8')) {
        setIsLiveStream(true);
        setVideoUrl(url);
        setStreamProcessing(false);
        return url;
      }
      
      // Set streaming type flags
      setIsLiveStream(true);
      setIsStreamingUrl(true);
      
      // Create HLS stream
      console.log(`Creating HLS stream from URL: ${url.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@')}`);
      const hlsUrl = await createHlsStream(url);
      
      console.log(`HLS stream URL: ${hlsUrl}`);
      setVideoUrl(hlsUrl);
      setStreamProcessing(false);
      
      return hlsUrl;
    } catch (error) {
      setStreamProcessing(false);
      setStreamError(error instanceof Error ? error.message : 'Unknown error creating stream');
      throw error;
    }
  }, []);

  // Handle file upload
  const handleFileUpload = useCallback(async (file: File) => {
    console.log('File uploaded:', file.name, file.type, 'Size:', file.size);
    
    // First stop any current stream
    if (isStreaming) {
      await stopStream();
    }
    
    setOriginalFile(file);
    setHasUploadedFile(true);
    setFormatNotSupported(false);
    setStreamError(null);
    setIsHikvisionFormat(false); // Will be set during processing
    
    // Store the file info but don't process it yet
    // Processing will happen when the user clicks "Start"
    toast.success('Video file loaded', {
      description: `${file.name} (${(file.size / (1024 * 1024)).toFixed(2)} MB)`
    });
  }, [isStreaming]);

  // Initialize the WebSocket connection for AI inference using the improved helper
  const initializeWebSocket = useCallback(() => {
    // Close any existing connection
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    
    if (wsHelperRef.current) {
      wsHelperRef.current.close();
      wsHelperRef.current = null;
    }
    
    // If already connecting, don't start another
    if (isWSConnectingRef.current) {
      return;
    }
    
    isWSConnectingRef.current = true;
    
    try {
      // Determine WebSocket protocol (wss:// for https, ws:// for http)
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host;
      const wsUrl = `${protocol}//${host}/ws/inference`;
      
      console.log('Connecting to WebSocket:', wsUrl);
      
      const wsHelper = createWebSocketWithReconnect(
        wsUrl,
        // onOpen
        () => {
          console.log('WebSocket connection established');
          isWSConnectingRef.current = false;
          
          // Send initial configuration message with active models
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            const config = {
              action: 'configure',
              models: activeModels || [],
              settings: {
                confidence_threshold: 0.45,
                fps: fps
              }
            };
            
            console.log('Sending WebSocket configuration:', config);
            wsRef.current.send(JSON.stringify(config));
          }
        },
        // onMessage
        (data) => {
          if (data.client_id) {
            setSocketConnectionId(data.client_id);
            console.log('Connected with client ID:', data.client_id);
            return;
          }
          
          if (data.action === 'model_loading') {
            setIsModelLoading(true);
            console.log('AI model is loading...');
            return;
          }
          
          if (data.action === 'model_loaded') {
            setIsModelLoading(false);
            console.log('AI model loaded successfully');
            return;
          }
          
          if (data.detections) {
            // Update detections
            setDetections(data.detections || []);
            
            // Update inference stats
            if (data.inference_time !== undefined) {
              setInferenceTime(data.inference_time);
            }
            
            if (data.inference_location) {
              setInferenceLocation(data.inference_location as InferenceLocationType);
            }
          }
        },
        // onClose
        () => {
          console.log('WebSocket connection closed');
          isWSConnectingRef.current = false;
          wsRef.current = null;
        },
        // onError
        (error) => {
          console.error('WebSocket error:', error);
          isWSConnectingRef.current = false;
          
          // After multiple failures, show a toast to the user
          toast.error('Connection to AI server lost', {
            description: 'Trying to reconnect to the AI detection server...'
          });
        },
        // maxRetries - increasing from default 5 to 10
        10
      );
      
      // Store the WebSocket and helper
      wsRef.current = wsHelper.socket;
      wsHelperRef.current = wsHelper;
      
    } catch (error) {
      console.error('Error creating WebSocket:', error);
      isWSConnectingRef.current = false;
      
      toast.error('Failed to connect to AI server', {
        description: 'Please check your network connection and server status'
      });
    }
  }, [activeModels, fps]);

  // Function to capture video frames for processing
  const startFrameCapture = useCallback(() => {
    if (!videoRef.current || !isStreamingRef.current) {
      return;
    }
    
    const captureFrame = () => {
      if (!videoRef.current || !isStreamingRef.current) {
        return;
      }
      
      const videoElement = videoRef.current;
      
      // Only capture frames when video is playing, not paused, and has valid dimensions
      if (videoElement.readyState >= 2 && !videoElement.paused && 
          videoElement.videoWidth > 0 && videoElement.videoHeight > 0) {
        
        try {
          // Get the current frame
          const canvas = document.createElement('canvas');
          canvas.width = videoElement.videoWidth;
          canvas.height = videoElement.videoHeight;
          
          const ctx = canvas.getContext('2d');
          if (ctx) {
            // Draw the current frame
            ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
            
            // Convert to base64 for WebSocket transmission
            const imageData = canvas.toDataURL('image/jpeg', 0.7);
            
            // Send frame for processing if WebSocket is connected
            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
              wsRef.current.send(JSON.stringify({
                action: 'process_frame',
                frame: imageData,
                models: activeModels.map(m => m.path)
              }));
              
              // Update FPS counter
              frameCountRef.current++;
              const now = performance.now();
              
              // Update FPS every second
              if (now - lastFpsUpdateRef.current > 1000) {
                const elapsedSeconds = (now - (startTimeRef.current || now)) / 1000;
                if (elapsedSeconds > 0) {
                  const currentFps = Math.round(frameCountRef.current / elapsedSeconds);
                  setActualFps(currentFps);
                }
                lastFpsUpdateRef.current = now;
              }
            }
          }
        } catch (error) {
          console.error('Error capturing frame:', error);
        }
      }
      
      // Schedule the next frame capture if still streaming
      if (isStreamingRef.current) {
        // Use consistent interval based on target FPS
        const targetInterval = 1000 / fps;
        activeFrameRequestRef.current = requestAnimationFrame(() => {
          setTimeout(captureFrame, targetInterval);
        });
      }
    };
    
    // Start the capture loop
    captureFrame();
  }, [activeModels, fps]);

  // Stop streaming and clean up resources
  const stopStream = useCallback(async () => {
    console.log('Stopping stream');
    
    // Cancel any active frame requests
    if (activeFrameRequestRef.current !== null) {
      cancelAnimationFrame(activeFrameRequestRef.current);
      activeFrameRequestRef.current = null;
    }
    
    // Clean up WebSocket connection
    if (wsRef.current) {
      console.log('Closing WebSocket connection');
      wsRef.current.close();
      wsRef.current = null;
    }
    
    // Clean up WebSocket helper if exists
    if (wsHelperRef.current) {
      wsHelperRef.current.close();
      wsHelperRef.current = null;
    }
    
    // Stop monitoring HLS stream health
    if (streamMonitor) {
      console.log('Stopping HLS stream health monitoring');
      streamMonitor();
      setStreamMonitor(null);
    }
    
    // Clean up our internal HLS stream if needed
    if (isInternalStreamUrl(videoUrl)) {
      console.log('Stopping and cleaning up HLS stream');
      try {
        await stopHlsStream(videoUrl);
      } catch (error) {
        console.error('Error stopping HLS stream:', error);
      }
    }
    
    // Clean up object URLs to avoid memory leaks
    if (videoUrl && videoUrl.startsWith('blob:')) {
      console.log('Revoking object URL');
      URL.revokeObjectURL(videoUrl);
    }
    
    // Reset UI state
    setIsStreaming(false);
    isStreamingRef.current = false;
    setInferenceLocation(null);
    setInferenceTime(null);
    setActualFps(null);
    setDetections([]);
    setStreamError(null);
    
    // Stop video playback if ref exists
    if (videoRef.current) {
      videoRef.current.pause();
      setIsPlaying(false);
    }
    
    console.log('Stream stopped');
  }, [videoUrl, streamMonitor]);

  // Start the video streaming process
  const startStream = useCallback(async () => {
    try {
      if (isStreaming) {
        console.log('Already streaming, stopping current stream first');
        await stopStream();
      }
      
      // Reset monitoring and errors
      setStreamError(null);
      
      // Cleanup any existing stream monitor
      if (streamMonitor) {
        streamMonitor();
        setStreamMonitor(null);
      }

      let finalVideoUrl = videoUrl;
      setIsProcessing(true);
      
      if (hasUploadedFile && originalFile) {
        try {
          setIsTranscoding(true);
          
          // Detect file type
          const formatInfo = detectVideoFormat(originalFile);
          setIsHikvisionFormat(formatInfo.isHikvision);
          
          // Convert the file to a playable format if needed
          if (formatInfo.needsTranscoding) {
            console.log('Video needs transcoding: ', formatInfo);
            try {
              // Add a timeout to ensure we don't hang indefinitely
              const transcodePromise = convertToPlayableFormat(originalFile);
              const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error("Transcoding timed out")), 30000)
              );
              
              finalVideoUrl = await Promise.race([transcodePromise, timeoutPromise]) as string;
              console.log('Transcoding completed successfully:', finalVideoUrl);
              setVideoUrl(finalVideoUrl);
            } catch (error) {
              console.error('Error transcoding video:', error);
              setFormatNotSupported(true);
              setIsProcessing(false);
              setIsTranscoding(false);
              return;
            }
          } else {
            // For browser-compatible formats, create a direct object URL
            finalVideoUrl = URL.createObjectURL(originalFile);
            setVideoUrl(finalVideoUrl);
          }
          
          setIsTranscoding(false);
        } catch (error) {
          console.error('Error processing uploaded file:', error);
          setIsProcessing(false);
          setIsTranscoding(false);
          toast.error('Error processing video file', {
            description: error instanceof Error ? error.message : 'Unknown error'
          });
          return;
        }
      } else if (isRtspUrl(videoUrl) && !isInternalStreamUrl(videoUrl)) {
        // Handle RTSP URLs, converting to HLS
        try {
          setStreamProcessing(true);
          finalVideoUrl = await processRtspStream(videoUrl);
          
          if (isInternalStreamUrl(finalVideoUrl)) {
            // Start health monitoring for our own streams
            const monitor = await monitorHlsStream(
              finalVideoUrl,
              () => {
                // On error
                console.error('Stream health monitor detected failure');
                setStreamError('Stream connection lost');
                
                // Stop the stream to clean up resources
                if (isStreamingRef.current) {
                  stopStream().catch(console.error);
                }
              },
              () => {
                // On recovery
                if (streamError) {
                  setStreamError(null);
                }
              }
            );
            
            setStreamMonitor(() => monitor);
          }
        } catch (error) {
          console.error('Error processing RTSP stream:', error);
          setStreamProcessing(false);
          setIsProcessing(false);
          toast.error('Failed to connect to camera stream', {
            description: 'Please check the camera URL and network connectivity'
          });
          return;
        }
      }
      
      setIsProcessing(false);
      setStreamProcessing(false);

      // Start the WebSocket connection for inference
      initializeWebSocket();
      
      // Set streaming state
      setIsStreaming(true);
      isStreamingRef.current = true;
      
      console.log('Started streaming with URL:', finalVideoUrl);
      
      // Auto-play the video
      if (videoRef.current) {
        try {
          // Set autoplay attribute
          videoRef.current.autoplay = true;
          
          // Try to start playing (modern browsers require user interaction)
          const playPromise = videoRef.current.play();
          if (playPromise !== undefined) {
            playPromise
              .then(() => {
                setIsPlaying(true);
              })
              .catch(error => {
                console.warn('Auto-play prevented by browser:', error);
                setIsPlaying(false);
              });
          }
        } catch (error) {
          console.error('Error auto-playing video:', error);
        }
      }
      
      // Start FPS monitoring
      startTimeRef.current = performance.now();
      frameCountRef.current = 0;
      
      // If this is our internal HLS stream from RTSP, add a delay before processing frames
      if (isInternalStreamUrl(finalVideoUrl)) {
        console.log('Waiting for HLS stream to stabilize before processing frames...');
        setTimeout(() => {
          startFrameCapture();
        }, 4000); // 4 second delay for HLS streams (increased from 3s)
      } else {
        startFrameCapture();
      }
      
      toast.success('Video stream started');
      
    } catch (error) {
      console.error('Error starting stream:', error);
      setIsProcessing(false);
      setStreamProcessing(false);
      setIsTranscoding(false);
      toast.error('Failed to start video stream', {
        description: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }, [videoUrl, hasUploadedFile, originalFile, isStreaming, processRtspStream, streamError, streamMonitor, stopStream, initializeWebSocket, startFrameCapture]);

  // Toggle play/pause of the video
  const togglePlayPause = useCallback(() => {
    if (!videoRef.current) return;
    
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current.play()
        .then(() => {
          setIsPlaying(true);
        })
        .catch(error => {
          console.error('Error playing video:', error);
          toast.error('Error playing video', {
            description: 'Your browser prevented autoplay'
          });
        });
    }
  }, [isPlaying]);

  // Handle video metadata when it's loaded
  const handleVideoMetadata = useCallback((event: SyntheticEvent<HTMLVideoElement>) => {
    const video = event.target as HTMLVideoElement;
    setResolution({
      width: video.videoWidth,
      height: video.videoHeight
    });
    
    // Auto-start playing when metadata is loaded
    if (video.paused) {
      video.play().catch(error => {
        console.warn('Auto-play prevented by browser:', error);
      });
    }
  }, []);

  // Handle video loading errors
  const handleVideoError = useCallback((event: SyntheticEvent<HTMLVideoElement>) => {
    const video = event.target as HTMLVideoElement;
    console.error('Video error:', video.error);
    
    // Check error type
    if (video.error) {
      switch (video.error.code) {
        case MediaError.MEDIA_ERR_ABORTED:
          setStreamError('Playback aborted');
          break;
        case MediaError.MEDIA_ERR_NETWORK:
          setStreamError('Network error');
          break;
        case MediaError.MEDIA_ERR_DECODE:
          setStreamError('Format not supported');
          setFormatNotSupported(true);
          break;
        case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
          setStreamError('Source not supported');
          setFormatNotSupported(true);
          break;
        default:
          setStreamError('Unknown error');
      }
    }
    
    // For HLS stream errors, we might want to try reconnecting
    if (isInternalStreamUrl(videoUrl) || videoUrl.endsWith('.m3u8')) {
      toast.error('Stream playback error', {
        description: 'There was an error playing the camera stream'
      });
    } else {
      toast.error('Video playback error', {
        description: 'The selected video format may not be supported by your browser'
      });
    }
  }, [videoUrl]);
  
  // React to changes in camera prop and update the video URL
  useEffect(() => {
    if (camera) {
      // Reset any previous errors
      setStreamError(null);
      setFormatNotSupported(false);
      
      // Get the URL based on stream type
      const cameraUrl = camera.streamUrl[streamType] || camera.streamUrl.main;
      
      // Only update if the URL has changed
      if (cameraUrl && cameraUrl !== videoUrl) {
        setVideoUrl(cameraUrl);
        
        // If URL looks like an RTSP or stream URL, mark it as streaming URL
        setIsStreamingUrl(
          cameraUrl.startsWith('rtsp://') || 
          cameraUrl.startsWith('rtsps://') || 
          cameraUrl.startsWith('rtmp://') || 
          cameraUrl.endsWith('.m3u8')
        );
        
        // For HLS streams, mark as live
        if (cameraUrl.endsWith('.m3u8') || isInternalStreamUrl(cameraUrl)) {
          setIsLiveStream(true);
        }
      }
    }
  }, [camera, streamType]);
  
  // Auto-start streaming when initialVideoUrl is provided and autoStart is true
  useEffect(() => {
    if (autoStart && initialVideoUrl && !isStreaming) {
      if (initialVideoUrl.startsWith('rtsp://') || 
          initialVideoUrl.startsWith('rtsps://') ||
          initialVideoUrl.startsWith('rtmp://')) {
        // For RTSP URLs, we need to process them first
        setIsStreamingUrl(true);
        processRtspStream(initialVideoUrl)
          .then(() => {
            startStream();
          })
          .catch((error) => {
            console.error('Error processing RTSP stream:', error);
            toast.error('Failed to start RTSP stream');
          });
      } else {
        // For other URLs, start streaming directly
        startStream();
      }
    }
  }, []);

  // Clean up resources when unmounting
  useEffect(() => {
    return () => {
      // Stop the stream when component unmounts
      stopStream();
    };
  }, [stopStream]);

  // Update WebSocket config when active models change
  useEffect(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && isStreaming) {
      // Send updated configuration
      const config = {
        action: 'configure',
        models: activeModels || [],
        settings: {
          confidence_threshold: 0.45,
          fps: fps
        }
      };
      
      console.log('Updating WebSocket configuration with new models:', config);
      wsRef.current.send(JSON.stringify(config));
    }
  }, [activeModels, fps, isStreaming]);

  // Return the video state and control functions
  return {
    videoUrl,
    setVideoUrl,
    isStreaming,
    isPlaying,
    detections,
    resolution,
    isProcessing,
    setIsProcessing,
    hasUploadedFile,
    setHasUploadedFile,
    originalFile,
    setOriginalFile,
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
    streamError,
    videoRef,
    containerRef,
    startStream,
    stopStream,
    togglePlayPause,
    handleFileUpload,
    handleVideoMetadata,
    handleVideoError,
    processRtspStream,
    isStreamingUrl
  };
};

export default useVideoFeed;
