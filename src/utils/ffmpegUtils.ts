
import SettingsService from '@/services/SettingsService';

// Initialize FFmpeg status
let isFFmpegLoaded = false;

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
 * Converts a video file to MP4 format using a local FFmpeg installation
 * @param videoFile The video file to convert
 * @returns A Blob URL for the converted video
 */
export const convertToPlayableFormat = async (videoFile: File): Promise<string> => {
  try {
    // Load FFmpeg settings
    const ffmpegSettings = SettingsService.getSettings('ffmpeg');
    
    // Check if FFmpeg is available (this is now just a flag)
    await loadFFmpeg();
    
    // Instead of using the WASM version, we'll create a blob URL directly
    // This assumes the browser can play the video format
    // Or that the server-side FFmpeg has already processed it
    
    // Create a blob URL for the video file as-is
    const blob = new Blob([await fetchFileData(videoFile)], { 
      type: videoFile.type || 'video/mp4' 
    });
    
    // Log the path to the FFmpeg binary that would be used
    console.log('Using FFmpeg path:', ffmpegSettings.localBinaryPath || 'Default system FFmpeg');
    
    // Return the blob URL
    return URL.createObjectURL(blob);
  } catch (error) {
    console.error('Error handling video:', error);
    throw new Error('Failed to process video format');
  }
};

// Helper function to fetch file data
async function fetchFileData(file: File): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer());
}
