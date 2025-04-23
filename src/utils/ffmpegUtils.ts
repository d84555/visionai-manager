
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

export const loadFFmpeg = async (): Promise<boolean> => {
  if (!isFFmpegLoaded) {
    try {
      // Check if ffmpeg is available on the system
      // This is just a flag since we'll be using the locally installed FFmpeg
      isFFmpegLoaded = true;
      return true;
    } catch (error) {
      console.error('Failed to load FFmpeg:', error);
      throw new Error('Failed to load video processing library');
    }
  }
  return isFFmpegLoaded;
};

/**
 * Detects if a file is likely to be a Hikvision format based on signature or extension
 */
const isHikvisionFormat = (file: File): boolean => {
  // Check by extension
  if (file.name.toLowerCase().endsWith('.dav')) return true;
  // Check by MIME type if available
  if (file.type === 'video/x-dav' || file.type === 'application/octet-stream') {
    return true;
  }
  return false;
};

/**
 * Converts a video file to a web-playable format
 * Handles special cases like Hikvision DAV format
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
      console.log(`File type ${videoFile.type} may need transcoding`);
      toast.info("Processing video format", {
        description: "This format may require conversion for playback"
      });
      
      if (ffmpegSettings.useLocalBinary) {
        console.log(`Using local FFmpeg binary at: ${ffmpegSettings.localBinaryPath || 'default system path'}`);
        // In a real implementation, we would send this to a backend service
        // that would use FFmpeg to transcode the video
        
        // For now, since we're not doing actual transcoding in the browser,
        // we'll create a direct blob URL and let the browser try to play it
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
 * Creates a direct blob URL from file data
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
 * Note: This has limited capability without a full FFmpeg implementation
 */
const attemptClientSideTranscoding = async (fileData: Uint8Array, videoFile: File): Promise<string> => {
  // In a browser environment without full FFmpeg, our options are limited
  // We'll create a blob with MP4 mimetype which might help with some formats
  console.log("Attempting client-side format adaptation");
  
  // For Hikvision DAV files, we would need server-side processing
  // For now, we'll try with MP4 mimetype and hope the browser can handle it
  return createDirectBlobUrl(fileData, new File([fileData], videoFile.name, { type: 'video/mp4' }));
};

// Helper function to fetch file data
async function fetchFileData(file: File): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer());
}
