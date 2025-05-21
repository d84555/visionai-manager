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
  const maxRetries = 5;
  
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

    // Pre-fetch the stream to check its accessibility
    console.log('Pre-fetching HLS stream to validate:', src);
    fetch(src, { 
      method: 'GET',
      headers: {
        'Accept': 'application/vnd.apple.mpegurl, application/x-mpegURL, */*'
      },
      mode: 'cors',
      credentials: 'omit'
    })
    .then(response => {
      console.log('Pre-fetch response:', response.status, response.statusText);
      if (!response.ok) {
        console.warn(`Stream resource returned status ${response.status}`);
      }
      return response.text();
    })
    .then(text => {
      const isValidM3u8 = text.includes('#EXTM3U');
      console.log(`Received ${text.length} bytes. Is valid M3U8: ${isValidM3u8}`);
      if (isValidM3u8) {
        console.log('First 100 chars:', text.substring(0, 100));
      } else {
        console.warn('Content does not appear to be valid M3U8');
        setError('Invalid HLS stream format');
      }
    })
    .catch(error => {
      console.error('Error pre-fetching HLS stream:', error);
    });
    
    // Determine playback strategy - try both native and HLS.js
    const tryNativePlayback = () => {
      console.log('Attempting native HLS playback');
      videoElement.src = src;
      videoElement.load(); // Explicitly call load() to reset any previous state
      
      const playPromise = videoElement.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            console.log('Native HLS playback started successfully');
          })
          .catch((err) => {
            console.warn('Native HLS playback failed:', err);
            // If native playback fails and HLS.js is supported, try that instead
            if (isHlsSupported) {
              console.log('Falling back to HLS.js');
              tryHlsJsPlayback();
            } else {
              setError('Your browser does not support HLS playback');
            }
          });
      }
    };
    
    // HLS.js playback attempt
    const tryHlsJsPlayback = () => {
      if (!isHlsSupported) {
        console.error('HLS.js is not supported in this browser');
        setError('HLS.js is not supported in this browser');
        return;
      }
      
      try {
        console.log('Initializing HLS.js for:', src);
        const hls = new Hls({
          debug: false,            // Set to true for more verbose logging
          enableWorker: true,
          lowLatencyMode: true,
          backBufferLength: 90,
          maxBufferLength: 30,
          startLevel: -1,          // Auto level selection
          maxLoadingDelay: 4,      // Increase loading delay tolerance
          maxMaxBufferLength: 600, // Allow large buffer for smoother playback
          fragLoadingTimeOut: 20000, // Longer timeout for fragment loading
          manifestLoadingTimeOut: 20000, // Longer timeout for manifest loading
          levelLoadingTimeOut: 20000,    // Longer timeout for level loading
          xhrSetup: (xhr, url) => {
            // Add custom headers if needed
            xhr.setRequestHeader('Accept', 'application/vnd.apple.mpegurl, application/x-mpegURL, */*');
            xhr.withCredentials = false; // No credentials for cross-origin requests
          }
        });
        
        hlsRef.current = hls;
        
        hls.loadSource(src);
        hls.attachMedia(videoElement);
        
        hls.on(Hls.Events.MEDIA_ATTACHED, () => {
          console.log('HLS.js: Media attached successfully');
          if (autoPlay) {
            console.log('HLS.js: Attempting autoplay...');
            videoElement.play()
              .then(() => console.log('HLS.js: Autoplay started successfully'))
              .catch(err => console.error('HLS.js: Error playing video:', err));
          }
        });
        
        hls.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
          console.log('HLS.js: Manifest parsed successfully, found ' + data.levels.length + ' quality levels');
          setRetryCount(0); // Reset retry count on successful manifest parse
        });
        
        hls.on(Hls.Events.ERROR, (_, data) => {
          console.error('HLS.js error:', data);
          
          if (data.fatal) {
            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR:
                console.error('HLS.js: Fatal network error:', data);
                setError('Network error while loading stream: ' + data.details);
                
                // Implement retry logic for network errors
                if (retryCount < maxRetries) {
                  console.log(`Attempting to recover from network error (attempt ${retryCount + 1}/${maxRetries})...`);
                  setRetryCount(prevCount => prevCount + 1);
                  
                  // Wait before retrying
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
                console.error('HLS.js: Fatal media error:', data);
                setError('Media error, attempting to recover: ' + data.details);
                console.log('Attempting to recover from media error...');
                hls.recoverMediaError();
                break;
              default:
                console.error('HLS.js: Fatal error:', data);
                setError('Fatal error playing stream: ' + data.details);
                hls.destroy();
                break;
            }
          }
        });
        
        // Add listeners for request tracking
        hls.on(Hls.Events.MANIFEST_LOADING, (event, data) => {
          console.log('HLS.js: Manifest loading:', data.url);
        });
        
        hls.on(Hls.Events.LEVEL_LOADING, (event, data) => {
          console.log('HLS.js: Level loading:', data.url);
        });
        
        hls.on(Hls.Events.FRAG_LOADING, (event, data) => {
          console.log('HLS.js: Fragment loading:', data.frag.url);
        });
      } catch (error) {
        console.error('Error initializing HLS.js player:', error);
        setError('Failed to initialize video player: ' + error);
      }
    };
    
    // Start with native playback attempt first if supported,
    // otherwise go straight to HLS.js
    if (isHlsNativeSupported) {
      tryNativePlayback();
    } else if (isHlsSupported) {
      tryHlsJsPlayback();
    } else {
      setError('Your browser does not support HLS playback');
    }

    // Cleanup function
    return () => {
      if (hlsRef.current) {
        console.log('Destroying HLS instance');
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [src, autoPlay, videoRef, enabled, isHlsSupported, isHlsNativeSupported, retryCount, maxRetries]);

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
