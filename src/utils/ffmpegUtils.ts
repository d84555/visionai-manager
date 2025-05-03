
import { toast } from 'sonner';

// Function to convert video to a playable format using FFmpeg
export const convertToPlayableFormat = async (file: File): Promise<string> => {
  const apiUrl = '/api/transcode'; // Use relative URL
  const formData = new FormData();
  formData.append('file', file);

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.detail || `Transcoding failed with status: ${response.status}`);
    }

    const data = await response.json();
    if (!data.output_url) {
      throw new Error('Transcoding completed, but output URL is missing');
    }
    return data.output_url;
  } catch (error) {
    console.error('Error during video transcoding:', error);
    throw error;
  }
};

// Function to detect video format and determine if transcoding is needed
export const detectVideoFormat = (file: File): { needsTranscoding: boolean; isHikvision: boolean } => {
  const fileType = file.type;
  const fileName = file.name.toLowerCase();

  // Check for Hikvision DAV format
  if (fileName.endsWith('.dav')) {
    return { needsTranscoding: true, isHikvision: true };
  }

  // Check for other common video formats that might need transcoding
  const needsTranscoding = !(
    fileType.startsWith('video/mp4') ||
    fileType.startsWith('video/webm') ||
    fileName.endsWith('.mp4') ||
    fileName.endsWith('.webm') ||
    fileName.endsWith('.m3u8')
  );

  return { needsTranscoding, isHikvision: false };
};

// Function to create an HLS stream from an RTSP URL
export const createHlsStream = async (rtspUrl: string): Promise<string> => {
  const apiUrl = '/api/transcode/rtsp-to-hls'; // Use relative URL

  try {
    console.log('Creating HLS stream for URL:', rtspUrl.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@'));
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ rtsp_url: rtspUrl }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.detail || `Failed to create HLS stream: ${response.status}`);
    }

    const data = await response.json();
    if (!data.hls_url) {
      throw new Error('HLS stream creation completed, but HLS URL is missing');
    }
    console.log('HLS stream created successfully:', data.hls_url);
    return data.hls_url;
  } catch (error) {
    console.error('Error creating HLS stream:', error);
    toast.error('Failed to connect to RTSP stream. Please check your URL and try again.');
    throw error;
  }
};

// Function to stop an HLS stream
export const stopHlsStream = async (hlsUrl: string): Promise<void> => {
  const apiUrl = `/api/transcode/stop-hls?hls_url=${encodeURIComponent(hlsUrl)}`; // Use relative URL

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.detail || `Failed to stop HLS stream: ${response.status}`);
    }

    console.log('HLS stream stopped successfully');
  } catch (error) {
    console.error('Error stopping HLS stream:', error);
    throw error;
  }
};

// Function to check if a URL is an internal stream URL
export const isInternalStreamUrl = (url: string): boolean => {
  return url.includes('/transcode/hls/');
};

// Function to monitor the health of an HLS stream
export const monitorHlsStream = async (
  streamUrl: string,
  onError: () => void,
  onRecovery: () => void
): Promise<() => void> => {
  let isMonitoring = true;
  let errorCount = 0;
  const maxErrors = 3; // Number of consecutive errors before triggering onError

  const checkStreamHealth = async () => {
    if (!isMonitoring) return;

    try {
      const response = await fetch(streamUrl, { method: 'HEAD' });

      if (!response.ok) {
        errorCount++;
        console.warn(`HLS stream health check failed (${errorCount}/${maxErrors}): ${response.status}`);

        if (errorCount >= maxErrors) {
          onError();
          return; // Stop checking after triggering onError
        }
      } else {
        // Stream is healthy, reset error count and trigger onRecovery if needed
        if (errorCount > 0) {
          onRecovery();
        }
        errorCount = 0;
      }
    } catch (error) {
      errorCount++;
      console.error(`Error during HLS stream health check (${errorCount}/${maxErrors}):`, error);

      if (errorCount >= maxErrors) {
        onError();
        return; // Stop checking after triggering onError
      }
    } finally {
      if (isMonitoring) {
        setTimeout(checkStreamHealth, 5000); // Check every 5 seconds
      }
    }
  };

  checkStreamHealth();

  // Return a function to stop monitoring
  return () => {
    isMonitoring = false;
    console.log('HLS stream health monitoring stopped');
  };
};

interface WebSocketHelper {
  socket: WebSocket | null;
  close: () => void;
  isConnected: () => boolean;
}

/**
 * Creates a WebSocket with automatic reconnection
 */
export const createWebSocketWithReconnect = (
  url: string,
  onOpen: () => void,
  onMessage: (data: any) => void,
  onClose: () => void,
  onError: (error: Event) => void,
  maxRetries: number = 10,
  retryInterval: number = 2000
): WebSocketHelper => {
  let socket: WebSocket | null = null;
  let retries = 0;
  let timeoutId: NodeJS.Timeout | null = null;
  let forcedClose = false;
  let isConnected = false;

  const connect = () => {
    try {
      // Close any existing socket before creating a new one
      if (socket) {
        try {
          socket.close();
        } catch (e) {
          console.warn('[WebSocket] Error closing existing socket:', e);
        }
      }

      console.log(`[WebSocket] Connecting to ${url}${retries > 0 ? ` (attempt ${retries+1}/${maxRetries+1})` : ''}`);
      socket = new WebSocket(url);

      socket.onopen = () => {
        console.log('[WebSocket] Connection opened');
        isConnected = true;
        retries = 0; // Reset retries on successful connection
        onOpen();
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          onMessage(data);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      socket.onclose = (event) => {
        isConnected = false;
        
        if (forcedClose) {
          console.log('[WebSocket] Connection closed (intentional)');
          onClose();
          return;
        }

        console.log(`[WebSocket] Connection closed. Code: ${event.code}, Reason: ${event.reason}`);
        if (retries < maxRetries) {
          retries++;
          const delay = retryInterval * Math.min(retries, 5); // Exponential backoff up to 5x
          console.log(`[WebSocket] Will reconnect in ${delay}ms`);
          
          timeoutId = setTimeout(() => {
            connect();
          }, delay);
        } else {
          console.error('[WebSocket] Max retries reached. Not reconnecting.');
          onClose();
        }
      };

      socket.onerror = (event) => {
        console.error('[WebSocket] WebSocket error occurred:', event);
        onError(event);
      };
    } catch (err) {
      console.error('[WebSocket] Error creating WebSocket:', err);
      onError(new Event('error'));
      
      // Try to reconnect after a delay
      if (retries < maxRetries && !forcedClose) {
        retries++;
        const delay = retryInterval * Math.min(retries, 5);
        console.log(`[WebSocket] Will attempt to reconnect in ${delay}ms`);
        
        timeoutId = setTimeout(() => {
          connect();
        }, delay);
      }
    }
  };

  connect();

  return {
    socket,
    close: () => {
      console.log('[WebSocket] Manually closing WebSocket connection');
      forcedClose = true;
      if (socket) {
        try {
          socket.close();
        } catch (e) {
          console.warn('[WebSocket] Error while closing socket:', e);
        }
        socket = null;
      }
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    },
    isConnected: () => isConnected
  };
};
