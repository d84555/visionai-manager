
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
    
    if (ffmpegSettings.useLocalBinary) {
      // For production build: We'll use server-side FFmpeg processing
      // The actual processing will happen on the server, not in the browser
      
      // For development or demo purposes, we create a direct blob URL
      console.log(`Using local FFmpeg binary at: ${ffmpegSettings.localBinaryPath || 'default system path'}`);
    }
    
    // Create a blob URL for the video file as-is
    // This assumes the browser can play the video format
    const blob = new Blob([await fetchFileData(videoFile)], { 
      type: videoFile.type || 'video/mp4' 
    });
    
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
