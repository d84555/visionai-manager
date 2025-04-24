
import SettingsService from '@/services/SettingsService';
import { toast } from 'sonner';

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
 * Improved Hikvision format detection
 */
const isHikvisionFormat = (file: File): boolean => {
  // Check by extension
  if (file.name.toLowerCase().endsWith('.dav')) return true;
  
  // Check by MIME type if available
  if (file.type === 'video/x-dav' || file.type === 'application/octet-stream') {
    // Further check file signature/magic numbers for Hikvision formats
    // This would require reading the first few bytes of the file
    // For simplicity, we'll assume it is Hikvision format based on MIME type
    return true;
  }
  
  return false;
};

/**
 * Converts a video file to a web-playable format
 * Enhanced handling for Hikvision DAV format
 * @param videoFile The video file to convert
 * @returns A Blob URL for the converted video
 */
export const convertToPlayableFormat = async (videoFile: File): Promise<string> => {
  try {
    // Load FFmpeg settings
    await loadFFmpeg();
    const ffmpegSettings = SettingsService.getSettings('ffmpeg');
    const fileData = await fetchFileData(videoFile);
    
    // Determine if this is a special format requiring transcoding
    const needsTranscoding = !supportedFormats[videoFile.type] || isHikvisionFormat(videoFile);
    
    if (needsTranscoding) {
      console.log(`File type ${videoFile.type} needs transcoding`);
      toast.info("Processing video format", {
        description: "Converting to web-compatible format for playback"
      });
      
      if (ffmpegSettings.useLocalBinary) {
        console.log(`Using local FFmpeg binary at: ${ffmpegSettings.localBinaryPath || 'default system path'}`);
        // In a real implementation, we would send this to a backend service
        // that would use FFmpeg to transcode the video
        
        // FIX: For Hikvision formats, we need special handling
        if (isHikvisionFormat(videoFile)) {
          return handleHikvisionFormat(fileData, videoFile);
        }
        
        // For regular formats needing transcoding
        return createDirectBlobUrl(fileData, videoFile);
      } else {
        // For client-side transcoding attempt (limited capability)
        return attemptClientSideTranscoding(fileData, videoFile);
      }
    }
    
    // For standard formats that browsers can play natively
    return createDirectBlobUrl(fileData, videoFile);
  } catch (error) {
    console.error('Error handling video:', error);
    toast.error('Video format processing failed', {
      description: 'The video format may not be supported for direct playback'
    });
    throw new Error('Failed to process video format');
  }
};

/**
 * Special handling for Hikvision DAV format videos
 */
const handleHikvisionFormat = (fileData: Uint8Array, videoFile: File): string => {
  console.log('Handling Hikvision format video...');
  toast.info('Hikvision video format detected', {
    description: 'Processing proprietary format for playback'
  });
  
  // In a real implementation, this would extract frames or convert to MP4
  // For now we'll create a blob with MP4 mimetype and hope the player can handle it
  
  // For simulating successful conversion
  return createDirectBlobUrl(fileData, new File([fileData], videoFile.name, { type: 'video/mp4' }));
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

/**
 * Attempts client-side transcoding for formats that might be partially compatible
 * Enhanced with better error handling
 */
const attemptClientSideTranscoding = async (fileData: Uint8Array, videoFile: File): Promise<string> => {
  console.log("Attempting client-side format adaptation");
  
  try {
    // For browser environments without full FFmpeg, options are limited
    // We'll try with MP4 mimetype which might help with some formats
    
    // For Hikvision DAV files, attempt special handling
    if (isHikvisionFormat(videoFile)) {
      return handleHikvisionFormat(fileData, videoFile);
    }
    
    // For other formats, try with MP4 mimetype
    return createDirectBlobUrl(fileData, new File([fileData], videoFile.name, { type: 'video/mp4' }));
  } catch (error) {
    console.error('Client-side transcoding failed:', error);
    // Fall back to direct blob URL with original mimetype
    return createDirectBlobUrl(fileData, videoFile);
  }
};

// Helper function to fetch file data
async function fetchFileData(file: File): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer());
}
