
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';
import axios from 'axios';
import SettingsService from '../services/SettingsService';
import { toast } from 'sonner';

// Load FFmpeg settings
const getFFmpegSettings = () => {
  return SettingsService.getSettings('ffmpeg');
};

// Detect video format
export const detectVideoFormat = (file: File) => {
  const fileName = file.name.toLowerCase();
  const isHikvision = fileName.endsWith('.dav');
  const isH264Raw = fileName.endsWith('.264') || fileName.endsWith('.h264');
  const isH265Raw = fileName.endsWith('.265') || fileName.endsWith('.h265');
  const isRawStream = fileName.endsWith('.ts') || isH264Raw || isH265Raw;
  
  return {
    isHikvision,
    isH264Raw,
    isH265Raw,
    isRawStream,
    needsTranscoding: isHikvision || isRawStream
  };
};

// Convert video to playable format (browser compatible)
export const convertToPlayableFormat = async (file: File) => {
  const settings = getFFmpegSettings();
  
  // Check if we should use server-side transcoding
  if (settings.serverTranscoding === true) {
    return await sendToServerTranscoder(file);
  }

  // If not using server transcoding, use client-side FFmpeg
  const formatInfo = detectVideoFormat(file);
  
  // Use client-side FFmpeg
  if (formatInfo.needsTranscoding) {
    return await transcodeClientSide(file, formatInfo);
  } else {
    // For browser-compatible formats, create an object URL directly
    return URL.createObjectURL(file);
  }
};

// Server-side transcoding
async function sendToServerTranscoder(file: File): Promise<string> {
  try {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('outputFormat', 'mp4');
    formData.append('quality', 'medium');
    formData.append('preset', 'ultrafast');

    console.log('Sending file to server for transcoding...');
    
    // Use a relative URL to work with proxying
    const response = await axios.post('/transcode', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });
    
    const jobId = response.data.job_id;
    console.log('Transcode job created:', jobId);
    
    // Poll for completion
    let completed = false;
    let attempts = 0;
    const maxAttempts = 60; // 2 minutes (2s intervals)
    
    while (!completed && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      try {
        const statusResponse = await axios.get(`/transcode/${jobId}/status`);
        const status = statusResponse.data.status;
        
        console.log(`Transcode status: ${status}`);
        
        if (status === 'completed') {
          completed = true;
          return `/transcode/${jobId}/download`;
        } else if (status === 'failed') {
          throw new Error(`Transcode failed: ${statusResponse.data.error || 'Unknown error'}`);
        }
        
        attempts++;
      } catch (error) {
        console.error('Error checking transcode status:', error);
        attempts++;
      }
    }
    
    if (!completed) {
      throw new Error('Transcode timed out');
    }
    
    return `/transcode/${jobId}/download`;
  } catch (error) {
    console.error('Error in server-side transcoding:', error);
    throw error;
  }
}

// Define a type for possible FFmpeg output data formats 
type FFmpegFileData = 
  | Uint8Array 
  | string 
  | { buffer: ArrayBuffer } 
  | { buffer?: ArrayBuffer }
  | Record<string, unknown>
  | unknown;

// Client-side transcoding using FFmpeg.wasm
async function transcodeClientSide(file: File, formatInfo: any): Promise<string> {
  const settings = getFFmpegSettings();
  const ffmpeg = new FFmpeg();
  
  try {
    // Load the FFmpeg core - API has changed in newer versions
    await ffmpeg.load({
      coreURL: settings.corePath || 'https://unpkg.com/@ffmpeg/core@0.11.0/dist/ffmpeg-core.js'
    });
    
    const inputFileName = 'input_file';
    const outputFileName = 'output.mp4';
    
    // Write the input file
    await ffmpeg.writeFile(inputFileName, await fetchFile(file));
    
    // Execute FFmpeg command
    await ffmpeg.exec([
      '-i', inputFileName,
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-c:a', 'aac',
      '-strict', 'experimental',
      outputFileName
    ]);
    
    // Read the output file
    const data = await ffmpeg.readFile(outputFileName) as FFmpegFileData;
    
    // Fix: Convert FileData to Uint8Array - in newer FFmpeg.wasm versions,
    // data might be returned as Uint8Array directly or as a different type
    let uint8Array: Uint8Array;
    
    if (data instanceof Uint8Array) {
      // If data is already a Uint8Array, use it directly
      uint8Array = data;
    } else if (typeof data === 'string') {
      // If data is a string (base64 or binary string)
      uint8Array = new TextEncoder().encode(data);
    } else if (data && typeof data === 'object') {
      // Check if data is object-like with a buffer property
      const dataObj = data as { buffer?: ArrayBuffer };
      if (dataObj.buffer && dataObj.buffer instanceof ArrayBuffer) {
        // If data has a buffer property (TypedArray-like)
        uint8Array = new Uint8Array(dataObj.buffer);
      } else {
        // Fallback approach - try to convert to string first
        console.warn('Unexpected FileData format, attempting conversion');
        const dataStr = String(data);
        uint8Array = new TextEncoder().encode(dataStr);
      }
    } else {
      // Last resort fallback
      console.error('Unknown FFmpeg output format, using empty array');
      uint8Array = new Uint8Array();
    }
    
    const blob = new Blob([uint8Array], { type: 'video/mp4' });
    
    // Clean up files
    await ffmpeg.deleteFile(inputFileName);
    await ffmpeg.deleteFile(outputFileName);
    
    return URL.createObjectURL(blob);
  } catch (error) {
    console.error('Error in client-side transcoding:', error);
    throw error;
  }
}

// Enhanced function to properly encode RTSP URL with special characters in credentials
function encodeRtspUrl(url: string): string {
  try {
    // Check if this is an RTSP URL
    if (!url.startsWith('rtsp://') && !url.startsWith('rtsps://')) {
      return url;
    }

    // Parse the URL properly to handle special characters, especially @ in passwords
    const rtspRegex = /^(rtsp[s]?):\/\/([^:@]+):([^@]+)@([^:/]+)(?::(\d+))?(\/.*)?$/;
    const match = url.match(rtspRegex);
    
    if (!match) {
      console.log('URL format not recognized for encoding, using as-is');
      return url;
    }
    
    const [, protocol, username, password, host, port, path] = match;
    
    // Properly encode username and password
    const encodedUsername = encodeURIComponent(username);
    const encodedPassword = encodeURIComponent(password);
    
    // Reconstruct URL with properly encoded credentials
    const encodedUrl = `${protocol}://${encodedUsername}:${encodedPassword}@${host}${port ? `:${port}` : ''}${path || ''}`;
    
    console.log('Original URL (masked):', url.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@'));
    console.log('Encoded URL (masked):', encodedUrl.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@'));
    
    return encodedUrl;
  } catch (error) {
    console.error('Error encoding RTSP URL:', error);
    // Return original URL if there's an error
    return url;
  }
}

// Check if a URL is one of our own HLS streams
// Export this function since it's used in useVideoFeed.ts
export function isInternalStreamUrl(url: string): boolean {
  // Check if this URL is a path to one of our own stream endpoints
  const internalStreamPattern = /\/transcode\/stream\/[a-f0-9-]+\/index\.m3u8/;
  return internalStreamPattern.test(url);
}

// Check if an HLS stream is healthy by examining its M3U8 playlist
export async function checkHlsStreamHealth(streamUrl: string): Promise<boolean> {
  try {
    // Request the HLS playlist
    const response = await axios.get(streamUrl, {
      timeout: 8000, // Increased timeout from 5s to 8s to allow for slower streams
      headers: {
        'Accept': 'application/vnd.apple.mpegurl',
        'Cache-Control': 'no-cache'
      }
    });
    
    if (response.status !== 200) {
      console.warn(`HLS playlist returned status ${response.status}`);
      return false;
    }
    
    const playlist = response.data;
    
    // Check if playlist is empty or has the "waiting" pattern
    if (!playlist || 
        playlist.includes('#EXT-X-ENDLIST') && 
        !playlist.includes('segment_') &&
        !playlist.includes('.ts')) {
      console.warn('HLS playlist appears to be empty or waiting');
      return false;
    }
    
    // Check if playlist contains segment references
    if (!playlist.includes('EXTINF:') || 
        (!playlist.includes('.ts') && !playlist.includes('segment_'))) {
      console.warn('HLS playlist does not contain any segments');
      return false;
    }
    
    // If we get here, the playlist looks valid
    return true;
  } catch (error) {
    console.error('Error checking HLS stream health:', error);
    return false;
  }
}

// Track active streams for cleanup
const activeStreams: Map<string, string> = new Map();

// Stop an active HLS stream
export async function stopHlsStream(streamUrl: string): Promise<boolean> {
  try {
    if (!streamUrl || !isInternalStreamUrl(streamUrl)) {
      console.error('Not a valid internal stream URL:', streamUrl);
      return false;
    }
    
    // Extract the stream ID from the URL
    const match = streamUrl.match(/\/transcode\/stream\/([a-f0-9-]+)\/index\.m3u8/);
    if (!match || !match[1]) {
      console.error('Could not extract stream ID from URL:', streamUrl);
      return false;
    }
    
    const streamId = match[1];
    console.log('Stopping stream with ID:', streamId);
    
    // Call the API to stop the stream
    try {
      const response = await axios.delete(`/transcode/stream/${streamId}`);
      
      if (response.data && response.data.status === 'stopped') {
        console.log('Stream stopped successfully:', streamId);
        activeStreams.delete(streamId);
        return true;
      } else {
        console.error('Failed to stop stream:', response.data);
        return false;
      }
    } catch (error) {
      // Handle 500 errors by trying one more time
      console.warn('Error stopping HLS stream, retrying:', error);
      
      // Wait a moment before retrying
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      try {
        const retryResponse = await axios.delete(`/transcode/stream/${streamId}`);
        if (retryResponse.data) {
          console.log('Stream stopped on retry:', streamId);
          activeStreams.delete(streamId);
          return true;
        }
      } catch (retryError) {
        console.error('Failed to stop stream on retry:', retryError);
      }
      
      return false;
    }
  } catch (error) {
    console.error('Error stopping HLS stream:', error);
    return false;
  }
}

// Create HLS Stream from RTSP URL with improved browser compatibility
export async function createHlsStream(streamUrl: string, streamName: string = 'camera'): Promise<string> {
  try {
    // Check if this is one of our own stream URLs - prevent recursion
    if (isInternalStreamUrl(streamUrl)) {
      console.log('URL is already an internal stream URL, using as-is:', 
                  streamUrl.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@'));
      return streamUrl;
    }

    const settings = getFFmpegSettings();
    
    // Always use server-side transcoding for RTSP streams
    if (!settings.serverTranscoding) {
      console.warn('Server-side transcoding is disabled but required for RTSP streams. Using server anyway.');
    }
    
    // Encode the URL to handle special characters in credentials
    const encodedUrl = encodeRtspUrl(streamUrl);
    console.log('Sending encoded URL to backend (credentials masked):', 
      encodedUrl.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@'));
    
    const formData = new FormData();
    formData.append('stream_url', encodedUrl);
    formData.append('output_format', 'hls');
    formData.append('stream_name', streamName);
    
    // Add additional parameters for better browser compatibility
    formData.append('hls_time', '2'); // 2-second segments
    formData.append('hls_list_size', '6'); // Keep 6 segments in playlist
    formData.append('hls_flags', 'delete_segments+append_list+discont_start');
    formData.append('browser_compatibility', 'high'); // Request high browser compatibility
    
    // Add timeout and retry logic for stream creation request
    let attempts = 0;
    const maxAttempts = 3;
    let lastError;
    
    while (attempts < maxAttempts) {
      try {
        attempts++;
        
        // Log attempt number if retrying
        if (attempts > 1) {
          console.log(`Attempt ${attempts}/${maxAttempts} to connect to stream`);
          toast.info(`Retrying connection (${attempts}/${maxAttempts})...`);
        }
        
        // Make the request with timeout
        const response = await axios.post('/transcode/stream', formData, {
          timeout: 30000 // 30-second timeout
        });
        
        console.log('Stream response received:', response.data);
        
        // Check if we have a valid stream URL in the response
        if (!response.data.stream_url) {
          throw new Error('No stream URL returned from server');
        }
        
        // Store stream ID for potential cleanup later
        const streamId = response.data.stream_id;
        if (streamId) {
          activeStreams.set(streamId, response.data.stream_url);
        }
        
        // Add a longer waiting period for the stream to initialize
        console.log('Waiting for HLS stream segments to be generated...');
        
        // IMPORTANT IMPROVEMENT: Wait and check if stream is actually ready
        const streamUrl = response.data.stream_url;
        
        // Wait 6 seconds for initial segments to be generated (increased from 4s)
        await new Promise(resolve => setTimeout(resolve, 6000));
        
        // Check if HLS playlist contains valid segments
        let isStreaming = false;
        let healthCheckAttempts = 0;
        const maxHealthChecks = 5; // Increased from 3 to 5
        
        while (!isStreaming && healthCheckAttempts < maxHealthChecks) {
          healthCheckAttempts++;
          
          console.log(`Checking if stream is healthy (attempt ${healthCheckAttempts}/${maxHealthChecks})...`);
          isStreaming = await checkHlsStreamHealth(streamUrl);
          
          if (!isStreaming && healthCheckAttempts < maxHealthChecks) {
            console.log('Stream not ready yet, waiting 2 more seconds...');
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }
        
        if (!isStreaming) {
          console.warn('Stream did not initialize properly - playlist does not contain segments');
          // We'll still return the URL and let the video player handle errors
          toast.warning('Stream may take longer to start', {
            description: 'Please wait a few seconds for stream to initialize'
          });
        } else {
          console.log('HLS stream is healthy and ready to play');
        }
        
        // Return the stream URL path (this will be relative)
        return response.data.stream_url;
      } catch (error) {
        console.error(`Error creating HLS stream (attempt ${attempts}/${maxAttempts}):`, error);
        lastError = error;
        
        // Only retry if not the last attempt
        if (attempts < maxAttempts) {
          // Wait before retrying (exponential backoff)
          const delay = Math.min(3000 * Math.pow(2, attempts - 1), 10000);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    // If we get here, all attempts failed
    toast.error('Failed to connect to camera', {
      description: 'Please check your camera URL, credentials, and network connection'
    });
    
    throw new Error(`Failed to create HLS stream after ${maxAttempts} attempts: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
  } catch (error) {
    console.error('Error creating HLS stream:', error);
    toast.error('Failed to connect to camera', {
      description: 'Please check your camera URL, credentials, and network connection'
    });
    throw new Error(`Failed to create HLS stream: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Helper function to clean up all active streams on page unload
export function cleanupAllStreams(): void {
  console.log(`Cleaning up ${activeStreams.size} active streams`);
  
  // Stop each stream
  activeStreams.forEach((url, streamId) => {
    try {
      // Make a synchronous request to stop the stream
      const xhr = new XMLHttpRequest();
      xhr.open('DELETE', `/transcode/stream/${streamId}`, false);
      xhr.send();
      console.log(`Stopped stream ${streamId}`);
    } catch (e) {
      console.error(`Failed to stop stream ${streamId}:`, e);
    }
  });
  
  // Clear the map
  activeStreams.clear();
}

// Register beforeunload event to clean up streams when the page is closed
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    cleanupAllStreams();
  });
}

// Function to monitor HLS stream health and attempt recovery if needed
export async function monitorHlsStream(
  streamUrl: string, 
  onError: () => void,
  onRecovery: () => void
): Promise<() => void> {
  if (!isInternalStreamUrl(streamUrl)) {
    // Only monitor our own internal streams
    return () => {}; // Return empty cleanup function
  }
  
  let isRunning = true;
  let consecutiveFailures = 0;
  const maxFailures = 3;
  
  const checkInterval = setInterval(async () => {
    if (!isRunning) {
      return;
    }
    
    try {
      const isHealthy = await checkHlsStreamHealth(streamUrl);
      
      if (!isHealthy) {
        consecutiveFailures++;
        console.warn(`HLS stream health check failed ${consecutiveFailures}/${maxFailures} times`);
        
        if (consecutiveFailures >= maxFailures) {
          console.error('Stream health monitoring detected dead stream');
          onError();
          clearInterval(checkInterval);
          isRunning = false;
        }
      } else {
        if (consecutiveFailures > 0) {
          console.log('Stream recovered from previous failures');
          onRecovery();
        }
        consecutiveFailures = 0;
      }
    } catch (error) {
      console.error('Error in stream health monitoring:', error);
      consecutiveFailures++;
      
      if (consecutiveFailures >= maxFailures) {
        onError();
        clearInterval(checkInterval);
        isRunning = false;
      }
    }
  }, 10000); // Check every 10 seconds
  
  // Return a cleanup function
  return () => {
    isRunning = false;
    clearInterval(checkInterval);
  };
}

// Fix WebSocket connection issues when network is unstable
export function createWebSocketWithReconnect(
  wsUrl: string, 
  onOpen: () => void, 
  onMessage: (data: any) => void, 
  onClose: () => void, 
  onError: (error: Event) => void
): {
  socket: WebSocket | null;
  close: () => void;
} {
  let ws: WebSocket | null = null;
  let reconnectAttempts = 0;
  const maxReconnectAttempts = 5;
  let isClosingIntentionally = false;
  
  const connect = () => {
    try {
      ws = new WebSocket(wsUrl);
      
      ws.onopen = () => {
        console.log('WebSocket connection established');
        reconnectAttempts = 0;
        onOpen();
      };
      
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          onMessage(data);
        } catch (e) {
          console.error('Error parsing WebSocket message:', e);
        }
      };
      
      ws.onclose = (event) => {
        console.log('WebSocket connection closed:', event.code, event.reason);
        
        // If not closing intentionally, try to reconnect
        if (!isClosingIntentionally && reconnectAttempts < maxReconnectAttempts) {
          reconnectAttempts++;
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts - 1), 10000);
          console.log(`Attempting WebSocket reconnection in ${delay/1000}s (attempt ${reconnectAttempts}/${maxReconnectAttempts})...`);
          
          setTimeout(connect, delay);
        } else {
          // No more reconnect attempts or intentionally closed
          if (reconnectAttempts >= maxReconnectAttempts) {
            console.error('Maximum WebSocket reconnect attempts reached');
          }
          onClose();
        }
      };
      
      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        onError(error);
      };
    } catch (error) {
      console.error('Error setting up WebSocket:', error);
    }
  };
  
  // Initial connection
  connect();
  
  // Return an object with the socket and a close method
  return {
    socket: ws,
    close: () => {
      if (ws) {
        isClosingIntentionally = true;
        ws.close();
        ws = null;
      }
    },
  };
}
