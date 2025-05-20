
import { useRef, useEffect, useState } from 'react';
import Hls from 'hls.js';

interface UseHLSPlayerProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  src?: string;
  autoPlay?: boolean;
  enabled?: boolean;
}

/**
 * Hook to handle HLS video playback using hls.js
 */
export const useHLSPlayer = ({ 
  videoRef, 
  src, 
  autoPlay = true,
  enabled = true 
}: UseHLSPlayerProps) => {
  const hlsRef = useRef<Hls | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isHlsSupported, setIsHlsSupported] = useState<boolean>(() => Hls.isSupported());
  const [isHlsNativeSupported, setIsHlsNativeSupported] = useState<boolean>(false);
  
  // Check for native HLS support
  useEffect(() => {
    const video = document.createElement('video');
    setIsHlsNativeSupported(video.canPlayType('application/vnd.apple.mpegurl') !== '');
  }, []);

  useEffect(() => {
    // Skip if HLS is disabled or no source provided
    if (!enabled || !src) return;

    // Clean up any existing HLS instance
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    
    if (!videoRef.current) return;
    setError(null);

    const videoElement = videoRef.current;
    const isHLSStream = src.includes('.m3u8') || 
                         src.includes('application/x-mpegURL') || 
                         src.includes('application/vnd.apple.mpegurl');

    // Add debug logging to track URL processing
    console.log('HLS Player: Processing video source:', src);
    console.log('HLS Player: Is HLS stream?', isHLSStream);
    console.log('HLS Player: Native HLS support?', isHlsNativeSupported);
    console.log('HLS Player: HLS.js supported?', isHlsSupported);

    // If not an HLS stream, let the browser handle it
    if (!isHLSStream) return;
    
    // If native HLS is supported (like Safari), use native playback
    if (isHlsNativeSupported) {
      console.log('Using native HLS support for:', src);
      videoElement.src = src;
      if (autoPlay) videoElement.play().catch(err => console.error('Error playing video:', err));
      return;
    }

    // If hls.js is not supported, set error
    if (!isHlsSupported) {
      setError('Your browser does not support HLS playback');
      return;
    }

    // Use hls.js for playback
    try {
      console.log('Initializing hls.js for:', src);
      const hls = new Hls({
        debug: true, // Enable debug mode to see more logs
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 90,
        maxBufferLength: 30,
        xhrSetup: (xhr, url) => {
          // Log all XHR requests to debug network issues
          console.log(`HLS XHR request to: ${url}`);
        }
      });
      
      hlsRef.current = hls;
      
      hls.loadSource(src);
      hls.attachMedia(videoElement);
      
      hls.on(Hls.Events.MEDIA_ATTACHED, () => {
        console.log('HLS media attached');
        if (autoPlay) videoElement.play().catch(err => console.error('Error playing video:', err));
      });
      
      hls.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
        console.log('HLS manifest parsed, found ' + data.levels.length + ' quality levels');
      });
      
      hls.on(Hls.Events.ERROR, (_, data) => {
        console.error('HLS error occurred:', data);
        
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              console.error('HLS network error:', data);
              setError('Network error while loading stream: ' + data.details);
              hls.startLoad(); // try to recover
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              console.error('HLS media error:', data);
              setError('Media error, attempting to recover: ' + data.details);
              hls.recoverMediaError(); // try to recover
              break;
            default:
              console.error('Fatal HLS error:', data);
              setError('Fatal error playing stream: ' + data.details);
              hls.destroy();
              break;
          }
        } else {
          console.warn('Non-fatal HLS error:', data);
        }
      });
    } catch (error) {
      console.error('Error initializing HLS player:', error);
      setError('Failed to initialize video player');
    }

    // Cleanup function
    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [src, autoPlay, videoRef, enabled, isHlsSupported, isHlsNativeSupported]);

  // Check if source is HLS
  const isHLSSource = (source?: string): boolean => {
    if (!source) return false;
    return source.includes('.m3u8') || 
           source.includes('application/x-mpegURL') || 
           source.includes('application/vnd.apple.mpegurl');
  };

  return { 
    error,
    isHLSSource,
    isHlsSupported, 
    isHlsNativeSupported,
    hlsInstance: hlsRef.current
  };
};
