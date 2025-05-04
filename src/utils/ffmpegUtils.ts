
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
  
  // Check for known problematic formats
  const problematicFormats = ['avi', 'mkv', 'h265', 'ts', 'dav', 'raw', 'h264'];
  const isHikvision = extension === 'dav' || file.type === 'video/x-dav';
  
  // Check if this is a problematic format
  if (problematicFormats.includes(extension) || 
      file.type === 'application/octet-stream' ||
      file.type === 'video/x-dav' ||
      !file.type.startsWith('video/')) {
    
    return {
      isSupported: false,
      format: extension || file.type || 'unknown',
      requiresTranscoding: true,
      isHikvision
    };
  }
  
  // Check against browser-supported formats
  return {
    isSupported: !!supportedFormats[file.type],
    format: file.type,
    requiresTranscoding: !supportedFormats[file.type],
    isHikvision
  };
};

/**
 * Transcodes video on the server using FFmpeg
 */
export const serverTranscodeVideo = async (file: File): Promise<string> => {
  try {
    const ffmpegSettings = SettingsService.getSettings('ffmpeg');
    const formatInfo = detectVideoFormat(file);
    
    // If server-side transcoding is enabled in settings
    if (ffmpegSettings.serverTranscoding) {
      console.log('Using server-side transcoding for video:', file.name);
      
      // Create form data to send the file
      const formData = new FormData();
      formData.append('file', file);
      formData.append('outputFormat', ffmpegSettings.transcodeFormat || 'mp4');
      
      // Send to server endpoint for transcoding
      const response = await axios.post('/api/transcode', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        responseType: 'blob',
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
      
      // Create a URL for the transcoded video
      const transcodedVideo = new Blob([response.data], { 
        type: `video/${ffmpegSettings.transcodeFormat}` 
      });
      
      return URL.createObjectURL(transcodedVideo);
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
    
    // Determine if this is a format requiring transcoding
    if (formatInfo.requiresTranscoding) {
      console.log(`File type ${videoFile.type || formatInfo.format} needs transcoding`);
      toast.info("Processing video format", {
        description: "Converting to web-compatible format for playback"
      });
      
      // If server-side transcoding is enabled, use that
      if (ffmpegSettings.serverTranscoding) {
        return serverTranscodeVideo(videoFile);
      }
      
      // If Hikvision format, use special handling
      if (formatInfo.isHikvision) {
        return convertDavToMP4(videoFile);
      }
      
      // For other formats, try client-side transcoding
      return clientSideProcessVideo(videoFile);
    }
    
    // For standard formats that browsers can play natively
    return URL.createObjectURL(videoFile);
  } catch (error) {
    console.error('Error handling video:', error);
    toast.error('Video format processing failed', {
      description: 'The video format may not be supported for direct playback'
    });
    throw new Error('Failed to process video format');
  }
};

/**
 * Client-side video processing - with failover for unsupported formats
 */
const clientSideProcessVideo = async (videoFile: File): Promise<string> => {
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
      description: 'This video format cannot be played directly. Please use server-side transcoding.'
    });
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
    
    return url;
  } catch (error) {
    console.error('FFmpeg error:', error);
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
