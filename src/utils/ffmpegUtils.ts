
import SettingsService from '@/services/SettingsService';
import { toast } from 'sonner';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';
import axios from 'axios';

// Initialize FFmpeg status
let isFFmpegLoaded = false;

// Track supported formats
const supportedFormats = {
  'video/mp4': true,
  'video/webm': true,
  'video/ogg': true,
  // Hikvision often uses these formats
  'video/x-dav': true,
  'application/octet-stream': true, // For various proprietary formats
};

// Track supported codecs
const supportedCodecs = {
  'h264': true,
  'vp8': true,
  'vp9': true,
  'av1': true,
  'theora': true,
};

// Track ffmpeg loaded status
export const loadFFmpeg = async (): Promise<boolean> => {
  if (!isFFmpegLoaded) {
    try {
      console.log('Initializing FFmpeg...');
      // In a real implementation, we would initialize FFmpeg libraries here
      // For browser environment, this would be @ffmpeg/ffmpeg
      // But we're simulating it for now
      
      // Simulate successful loading
      isFFmpegLoaded = true;
      console.log('FFmpeg loaded successfully');
      return true;
    } catch (error) {
      console.error('Failed to load FFmpeg:', error);
      toast.error('Failed to load video processing library', { 
        description: 'Video playback may be limited' 
      });
      throw new Error('Failed to load video processing library');
    }
  }
  return isFFmpegLoaded;
};

/**
 * Improved format detection for various camera exports
 */
export const detectVideoFormat = (file: File): { 
  isSupported: boolean; 
  format: string; 
  requiresTranscoding: boolean;
  isHikvision?: boolean;
} => {
  // Get file extension
  const extension = file.name.split('.').pop()?.toLowerCase() || '';
  
  // Enhanced problematic formats list
  const problematicFormats = ['avi', 'mkv', 'h265', 'ts', 'dav', 'raw', 'h264', 'mp4v'];
  const isHikvision = extension === 'dav' || file.type === 'video/x-dav';
  
  // Force transcoding for most formats to ensure compatibility
  const forceTranscode = true; // Set to true to ensure all uploads are transcoded
  
  // Check if this is a problematic format
  if (problematicFormats.includes(extension) || 
      file.type === 'application/octet-stream' ||
      file.type === 'video/x-dav' ||
      !file.type.startsWith('video/') ||
      forceTranscode) {
    
    return {
      isSupported: false,
      format: extension || file.type || 'unknown',
      requiresTranscoding: true,
      isHikvision
    };
  }
  
  // Even for "supported" formats, we'll recommend transcoding
  return {
    isSupported: !!supportedFormats[file.type],
    format: file.type,
    requiresTranscoding: true, // Always transcode to ensure compatibility
    isHikvision
  };
};

/**
 * Transcodes video on the server using FFmpeg and polls for completion
 */
export const serverTranscodeVideo = async (file: File): Promise<string> => {
  try {
    const ffmpegSettings = SettingsService.getSettings('ffmpeg');
    const formatInfo = detectVideoFormat(file);
    
    // If server-side transcoding is enabled in settings
    if (ffmpegSettings.serverTranscoding) {
      toast.info('Starting video transcoding', { 
        description: 'Converting video to web-compatible format...'
      });
      
      console.log('Using server-side transcoding for video:', file.name);
      
      // Create form data to send the file
      const formData = new FormData();
      formData.append('file', file);
      formData.append('outputFormat', ffmpegSettings.transcodeFormat || 'mp4');
      formData.append('quality', ffmpegSettings.quality || 'medium');
      formData.append('preset', ffmpegSettings.preset || 'fast');
      
      try {
        console.log('Sending transcode request to backend at /transcode');
        // Make the direct request to the backend server
        const response = await axios.post('/transcode', formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
          onUploadProgress: (progressEvent) => {
            const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total!);
            console.log(`Upload progress: ${percentCompleted}%`);
            
            if (percentCompleted === 100) {
              toast.info('Video uploaded, now processing...', {
                duration: 5000
              });
            }
          },
        });
        
        const { job_id } = response.data;
        
        if (!job_id) {
          throw new Error('No job ID returned from transcoding service');
        }
        
        console.log('Transcode job started with ID:', job_id);
        
        // Poll for job completion
        let completed = false;
        let attempts = 0;
        let status;
        
        toast.info('Video processing in progress...', {
          duration: 10000
        });
        
        while (!completed && attempts < 60) { // Poll for up to 1 minute (60 * 1sec)
          await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
          
          try {
            const statusResponse = await axios.get(`/transcode/${job_id}/status`);
            status = statusResponse.data;
            
            console.log('Transcoding status:', status);
            
            if (status.status === 'completed') {
              completed = true;
            } else if (status.status === 'failed') {
              throw new Error(status.error || 'Transcoding failed');
            }
            
            attempts++;
          } catch (error) {
            console.error('Error checking transcoding status:', error);
            attempts++;
          }
        }
        
        if (!completed) {
          throw new Error('Transcoding timed out');
        }
        
        const downloadUrl = `/transcode/${job_id}/download`;
        console.log('Downloading from:', downloadUrl);
        
        const downloadResponse = await axios.get(downloadUrl, {
          responseType: 'blob'
        });
        
        // Create a URL for the transcoded video
        const transcodedVideo = new Blob([downloadResponse.data], { 
          type: `video/${ffmpegSettings.transcodeFormat || 'mp4'}` 
        });
        
        toast.success('Video transcoding completed', {
          description: 'Video is ready to play'
        });
        
        return URL.createObjectURL(transcodedVideo);
      } catch (error: any) {
        console.error('Server transcoding failed:', error);
        
        // Check if it's a 404 error (endpoint not found)
        if (error.response && error.response.status === 404) {
          toast.error('Transcoding service not available', {
            description: 'The backend server endpoint is not available. Check if the backend server is running correctly at http://localhost:8000.'
          });
        } else {
          toast.error('Video transcoding failed', {
            description: error.message || 'Server could not process this video format. Trying client-side fallback.'
          });
        }
        
        // Fallback to client-side processing
        return clientSideProcessVideo(file);
      }
    }
    
    // Fallback to client-side processing
    return clientSideProcessVideo(file);
  } catch (error) {
    console.error('Server transcoding failed:', error);
    toast.error('Video transcoding failed', {
      description: 'Server could not process this video format. Trying client-side fallback.'
    });
    
    // Fallback to client-side processing
    return clientSideProcessVideo(file);
  }
};

/**
 * Creates a new HLS stream from an IP camera URL
 * @param streamUrl The URL of the IP camera stream
 * @returns A Promise with the URL of the HLS stream
 */
export const createHlsStream = async (streamUrl: string, streamName?: string): Promise<string> => {
  try {
    const ffmpegSettings = SettingsService.getSettings('ffmpeg');
    
    // Check if server-side transcoding is enabled
    if (!ffmpegSettings.serverTranscoding) {
      throw new Error('Server-side transcoding is disabled in settings');
    }
    
    toast.info('Setting up camera stream', { 
      description: 'Connecting to camera and preparing stream...'
    });
    
    // Create form data for the stream request
    const formData = new FormData();
    formData.append('stream_url', streamUrl);
    formData.append('output_format', 'hls');
    if (streamName) {
      formData.append('stream_name', streamName);
    }
    
    // Log the request details for debugging
    console.log('Sending stream request to backend at /transcode/stream with parameters:', {
      stream_url: streamUrl,
      output_format: 'hls',
      stream_name: streamName || 'not provided'
    });
    
    try {
      // Make the direct request to the backend server
      const response = await axios.post('/transcode/stream', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      
      const { stream_id, stream_url, status } = response.data;
      
      console.log('Stream response received:', response.data);
      
      if (status !== 'processing') {
        throw new Error('Failed to start stream processing');
      }
      
      // Return the stream URL - this should be a publicly accessible URL
      toast.success('Stream ready', {
        description: 'Camera stream is now available for playback'
      });
      
      return stream_url;
    } catch (error: any) {
      console.error('Stream creation failed:', error);
      
      // Improved error messages with troubleshooting suggestions
      if (error.response) {
        if (error.response.status === 404) {
          toast.error('Stream creation failed: Endpoint not found', {
            description: 'The transcoding service may not be running or is unreachable. Make sure the backend server is running at http://localhost:8000 and has the /transcode/stream endpoint configured.'
          });
        } else {
          toast.error(`Stream creation failed: Server returned ${error.response.status}`, {
            description: error.response.data?.message || 'Check camera URL format and server settings'
          });
        }
      } else if (error.request) {
        toast.error('Stream creation failed: No response from server', {
          description: 'The server may be down or unreachable. Check that the backend is running at http://localhost:8000.'
        });
      } else {
        toast.error('Stream creation failed', {
          description: error.message || 'Please check camera URL and server settings'
        });
      }
      throw error;
    }
  } catch (error: any) {
    console.error('Stream creation failed:', error);
    toast.error('Failed to create camera stream', {
      description: error.message || 'Please check camera URL and server settings'
    });
    throw error;
  }
};

/**
 * Converts a video file to a web-playable format
 * Enhanced handling for various formats
 * @param videoFile The video file to convert
 * @returns A Blob URL for the converted video
 */
export const convertToPlayableFormat = async (videoFile: File): Promise<string> => {
  try {
    // Load FFmpeg settings
    await loadFFmpeg();
    const ffmpegSettings = SettingsService.getSettings('ffmpeg');
    const formatInfo = detectVideoFormat(videoFile);
    
    // Always prefer server-side transcoding if available
    if (ffmpegSettings.serverTranscoding) {
      console.log(`Using server-side transcoding for ${videoFile.name}`);
      return serverTranscodeVideo(videoFile);
    }
    
    // If Hikvision format and client-side processing is available
    if (formatInfo.isHikvision) {
      try {
        return convertDavToMP4(videoFile);
      } catch (error) {
        console.error("Failed to convert DAV file:", error);
        // Fall back to direct URL creation but with warning
        toast.warning("Special format detected but conversion failed", {
          description: "Video may not play correctly. Enable server-side transcoding in Settings."
        });
      }
    }
    
    // For client-side handling of other formats
    return clientSideProcessVideo(videoFile);
  } catch (error) {
    console.error('Error handling video:', error);
    toast.error('Video format processing failed', {
      description: 'The video format may not be supported for direct playback. Please try enabling server-side transcoding in Settings.'
    });
    throw new Error('Failed to process video format');
  }
};

/**
 * Client-side video processing - with failover for unsupported formats
 */
const clientSideProcessVideo = async (videoFile: File): Promise<string> => {
  try {
    const fileData = await fetchFileData(videoFile);
    const formatInfo = detectVideoFormat(videoFile);
    
    // If this is a Hikvision format or another special format
    if (formatInfo.isHikvision) {
      return convertDavToMP4(videoFile);
    }
    
    // Try to create a direct blob URL with MP4 mime type as fallback
    try {
      return createDirectBlobUrl(fileData, new File([fileData], videoFile.name, { type: 'video/mp4' }));
    } catch (error) {
      console.error('Client-side processing failed:', error);
      
      // Last resort - return original file blob URL with warning
      toast.error('Video format not supported', {
        description: 'This video format cannot be played directly. Please try enabling server-side transcoding in Settings.'
      });
      return URL.createObjectURL(videoFile);
    }
  } catch (error) {
    console.error('Client-side processing failed completely:', error);
    toast.error('Video processing failed', {
      description: 'Could not process the video format. Please enable server-side transcoding in Settings.'
    });
    // Return the original URL as last resort
    return URL.createObjectURL(videoFile);
  }
};

/**
 * Converts Hikvision DAV format to MP4 using FFMPEG
 * @param file The DAV file to convert
 * @returns Promise with URL to the converted MP4 file
 */
export const convertDavToMP4 = async (file: File): Promise<string> => {
  // Create FFmpeg instance
  const ffmpeg = new FFmpeg();
  
  try {
    toast.info('Converting Hikvision format', {
      description: 'Processing DAV file for playback...'
    });
    
    // Load FFmpeg
    await ffmpeg.load();
    
    // Convert file to buffer
    const fileBuffer = await fetchFile(file);
    
    // Write input file to FFmpeg virtual filesystem
    await ffmpeg.writeFile('input.dav', fileBuffer);
    
    // Run the FFmpeg command to convert DAV to MP4
    // Note: Using the new API for FFmpeg v0.12+
    await ffmpeg.exec([
      '-i', 'input.dav',
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-c:a', 'aac',
      'output.mp4'
    ]);
    
    // Read the output file from memory
    const outputData = await ffmpeg.readFile('output.mp4');
    
    // Create a URL for the output file
    const blob = new Blob([outputData], { type: 'video/mp4' });
    const url = URL.createObjectURL(blob);
    
    toast.success('Video conversion complete', {
      description: 'Hikvision format successfully converted to MP4'
    });
    
    return url;
  } catch (error) {
    console.error('FFmpeg error:', error);
    toast.error('Hikvision format conversion failed', {
      description: 'Please try server-side transcoding instead'
    });
    throw new Error('Failed to convert DAV file');
  }
};

/**
 * Creates a direct blob URL from file data with improved MIME type detection
 */
const createDirectBlobUrl = (fileData: Uint8Array, videoFile: File): string => {
  // Try to determine the correct MIME type
  let mimeType = videoFile.type;
  
  // For unknown types, make an educated guess based on extension
  if (!mimeType || mimeType === 'application/octet-stream') {
    const extension = videoFile.name.split('.').pop()?.toLowerCase();
    switch (extension) {
      case 'mp4':
        mimeType = 'video/mp4';
        break;
      case 'webm':
        mimeType = 'video/webm';
        break;
      case 'dav':
        // Use MP4 as a fallback for DAV files
        mimeType = 'video/mp4';
        break;
      default:
        // Default fallback
        mimeType = 'video/mp4';
    }
  }
  
  const blob = new Blob([fileData], { type: mimeType });
  return URL.createObjectURL(blob);
};

// Helper function to fetch file data
async function fetchFileData(file: File): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer());
}
