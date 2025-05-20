
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
  const [retryCount, setRetryCount] = useState(0);
  const maxRetries = 3;
  
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
    if (!isHLSStream) {
      console.log('Not an HLS stream, letting browser handle playback');
      videoElement.src = src;
      if (autoPlay) videoElement.play().catch(err => console.error('Error playing video:', err));
      return;
    }
    
    // Force a direct fetch to the URL to verify it's accessible
    console.log('Testing direct URL access with fetch:', src);
    fetch(src, { 
      method: 'GET',
      headers: {
        'Accept': 'application/vnd.apple.mpegurl, application/x-mpegURL, */*'
      },
      mode: 'cors', // Explicitly set CORS mode
      credentials: 'omit' // Don't send credentials
    })
      .then(response => {
        console.log('Direct fetch test response:', response.status, response.statusText, response.headers.get('content-type'));
        return response.text();
      })
      .then(text => {
        console.log(`Received ${text.length} bytes of content. First 100 chars:`, text.substring(0, 100));
        if (text.includes('#EXTM3U')) {
          console.log('Content validated as M3U8 format');
        } else {
          console.warn('Content does not appear to be in M3U8 format');
        }
      })
      .catch(err => {
        console.error('Direct fetch test error:', err.message);
      });
    
    // Try native playback first regardless of detected support
    // This works better for direct HLS URLs in some browsers
    try {
      console.log('Attempting direct native playback first');
      videoElement.src = src;
      
      const playPromise = videoElement.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            console.log('Native playback started successfully');
          })
          .catch((err) => {
            console.warn('Native playback failed, falling back to HLS.js:', err);
            // If native playback fails and HLS.js is supported, try that instead
            if (isHlsSupported && hlsRef.current === null) {
              initializeHlsPlayer(src, videoElement);
            } else if (!isHlsSupported) {
              setError('Your browser does not support HLS playback');
            }
          });
      }
      return;
    } catch (err) {
      console.warn('Error during native playback attempt:', err);
      // Fall through to HLS.js if native playback throws an exception
    }

    // If HLS.js is not supported, we already tried native playback
    if (!isHlsSupported) {
      setError('Your browser does not support HLS playback');
      return;
    }

    // Initialize HLS.js player
    initializeHlsPlayer(src, videoElement);

    // Cleanup function
    return () => {
      if (hlsRef.current) {
        console.log('Destroying HLS instance');
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [src, autoPlay, videoRef, enabled, isHlsSupported, isHlsNativeSupported, retryCount]);

  // Initialize HLS.js player
  const initializeHlsPlayer = (src: string, videoElement: HTMLVideoElement) => {
    try {
      console.log('Initializing hls.js for:', src);
      const hls = new Hls({
        debug: true, // Enable debug mode to see more logs
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 90,
        maxBufferLength: 30,
        startLevel: -1, // Auto level selection
        xhrSetup: (xhr, url) => {
          // Log all XHR requests to debug network issues
          console.log(`HLS XHR request to: ${url}`);
          // Add HLS-specific headers
          xhr.setRequestHeader('Accept', 'application/vnd.apple.mpegurl, application/x-mpegURL, */*');
          xhr.withCredentials = false; // No credentials for cross-origin requests
        }
      });
      
      hlsRef.current = hls;
      
      // Force a load attempt and log the result
      console.log('Loading HLS source:', src);
      hls.loadSource(src);
      hls.attachMedia(videoElement);
      
      hls.on(Hls.Events.MEDIA_ATTACHED, () => {
        console.log('HLS media attached successfully');
        if (autoPlay) {
          console.log('Attempting autoplay...');
          videoElement.play()
            .then(() => console.log('Autoplay started successfully'))
            .catch(err => console.error('Error playing video:', err));
        }
      });
      
      hls.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
        console.log('HLS manifest parsed successfully, found ' + data.levels.length + ' quality levels');
        setRetryCount(0); // Reset retry count on successful manifest parse
      });
      
      hls.on(Hls.Events.ERROR, (_, data) => {
        console.error('HLS error occurred:', data);
        
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              console.error('HLS network error:', data);
              setError('Network error while loading stream: ' + data.details);
              
              // Implement retry logic for network errors
              if (retryCount < maxRetries) {
                console.log(`Attempting to recover from network error (attempt ${retryCount + 1}/${maxRetries})...`);
                setRetryCount(prevCount => prevCount + 1);
                
                // Wait a bit before retrying
                setTimeout(() => {
                  console.log('Reloading source after network error');
                  hls.loadSource(src);
                  hls.startLoad();
                }, 2000);
              } else {
                console.error('Maximum retry attempts reached for network error');
              }
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              console.error('HLS media error:', data);
              setError('Media error, attempting to recover: ' + data.details);
              console.log('Attempting to recover from media error...');
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
      
      // Add listeners for tracking requests
      hls.on(Hls.Events.MANIFEST_LOADING, (event, data) => {
        console.log('HLS manifest loading:', data.url);
      });
      
      hls.on(Hls.Events.LEVEL_LOADING, (event, data) => {
        console.log('HLS level loading:', data.url);
      });
      
      hls.on(Hls.Events.FRAG_LOADING, (event, data) => {
        console.log('HLS fragment loading:', data.frag.url);
      });
    } catch (error) {
      console.error('Error initializing HLS player:', error);
      setError('Failed to initialize video player');
    }
  };

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
    hlsInstance: hlsRef.current,
    retryCount,
    maxRetries
  };
};
