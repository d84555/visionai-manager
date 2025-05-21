
import { useEffect, useState, useRef, MutableRefObject } from 'react';
import Hls from 'hls.js';

export interface UseHLSPlayerProps {
  videoRef: MutableRefObject<HTMLVideoElement | null>;
  enabled?: boolean;
  streamUrl?: string;
}

export const useHLSPlayer = ({ 
  videoRef, 
  enabled = true,
  streamUrl = ''
}: UseHLSPlayerProps) => {
  const [error, setError] = useState<string>('');
  const [isHlsSupported, setIsHlsSupported] = useState<boolean>(!!Hls.isSupported());
  const [isHlsNativeSupported, setIsHlsNativeSupported] = useState<boolean>(false);
  const [retryCount, setRetryCount] = useState(0);
  const [hlsLoading, setHlsLoading] = useState(false);
  const [hlsError, setHlsError] = useState(false);
  
  const maxRetries = 3;
  const hlsRef = useRef<Hls | null>(null);

  const isHLSSource = (source?: string): boolean => {
    if (!source) return false;
    return source.includes('.m3u8') || source.startsWith('hls://');
  };

  useEffect(() => {
    // Check for native HLS support (Safari, iOS)
    if (videoRef.current) {
      const canPlayHLS = videoRef.current.canPlayType('application/vnd.apple.mpegurl');
      setIsHlsNativeSupported(canPlayHLS === 'probably' || canPlayHLS === 'maybe');
    }
    
    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [videoRef]);

  useEffect(() => {
    if (!enabled || !streamUrl) return;
    
    // Check if the stream is an HLS stream
    if (isHLSSource(streamUrl)) {
      setHlsLoading(true);
      setHlsError(false);
      
      const initHLS = async () => {
        try {
          // If HLS.js is supported
          if (Hls.isSupported()) {
            if (hlsRef.current) {
              hlsRef.current.destroy();
            }
            
            const hls = new Hls({
              maxBufferLength: 30,
              maxMaxBufferLength: 60,
              capLevelToPlayerSize: true,
              startLevel: -1, // Auto level selection
            });
            
            hlsRef.current = hls;
            
            hls.on(Hls.Events.ERROR, (event, data) => {
              console.error('HLS error:', data);
              if (data.fatal) {
                setHlsError(true);
                
                // Try to recover on fatal errors
                if (retryCount < maxRetries) {
                  setRetryCount(prev => prev + 1);
                  switch (data.type) {
                    case Hls.ErrorTypes.NETWORK_ERROR:
                      console.log('Fatal network error, trying to recover...');
                      hls.startLoad();
                      break;
                    case Hls.ErrorTypes.MEDIA_ERROR:
                      console.log('Fatal media error, trying to recover...');
                      hls.recoverMediaError();
                      break;
                    default:
                      console.log('Fatal error, cannot recover');
                      break;
                  }
                } else {
                  hls.destroy();
                  setError('Failed to load HLS stream after multiple attempts');
                }
              }
            });
            
            hls.on(Hls.Events.MANIFEST_PARSED, () => {
              setHlsLoading(false);
              if (videoRef.current) {
                videoRef.current.play().catch(err => {
                  console.error('Error playing HLS stream:', err);
                });
              }
            });
            
            if (videoRef.current) {
              hls.loadSource(streamUrl);
              hls.attachMedia(videoRef.current);
            }
          } 
          // For Safari and iOS which have native HLS support
          else if (isHlsNativeSupported && videoRef.current) {
            videoRef.current.src = streamUrl;
            videoRef.current.addEventListener('loadedmetadata', () => {
              setHlsLoading(false);
              videoRef.current?.play().catch(err => {
                console.error('Error playing native HLS stream:', err);
                setHlsError(true);
              });
            });
            
            videoRef.current.addEventListener('error', () => {
              console.error('Error loading native HLS stream');
              setHlsError(true);
              setError('Your browser failed to play this HLS stream');
            });
          } else {
            setHlsError(true);
            setError('HLS streaming is not supported in this browser');
          }
        } catch (err) {
          console.error('Error initializing HLS player:', err);
          setHlsError(true);
          setError('Failed to initialize HLS player');
        }
      };
      
      initHLS();
    }
    
    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [streamUrl, enabled, isHlsNativeSupported, retryCount, maxRetries]);

  return { 
    error, 
    isHLSSource, 
    isHlsSupported, 
    isHlsNativeSupported,
    hlsInstance: hlsRef.current as Hls,
    retryCount,
    maxRetries,
    hlsLoading,
    hlsError
  };
};
