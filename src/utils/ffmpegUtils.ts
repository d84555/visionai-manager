
import { createFFmpeg, fetchFile } from '@ffmpeg/ffmpeg';
import SettingsService from '@/services/SettingsService';

// Create a singleton instance of FFmpeg
const getFFmpegInstance = () => {
  // Load FFmpeg settings from our service 
  const ffmpegSettings = SettingsService.getSettings('ffmpeg');
  
  // Use the custom path if enabled, otherwise use default
  const corePath = ffmpegSettings.customPath ? 
    ffmpegSettings.corePath : 
    'https://unpkg.com/@ffmpeg/core@0.11.0/dist/ffmpeg-core.js';
  
  return createFFmpeg({
    log: true,
    corePath: corePath,
  });
};

const ffmpeg = getFFmpegInstance();

// Initialize FFmpeg
let isFFmpegLoaded = false;

export const loadFFmpeg = async () => {
  if (!isFFmpegLoaded) {
    await ffmpeg.load();
    isFFmpegLoaded = true;
  }
  return ffmpeg;
};

/**
 * Converts a video file to MP4 format using FFmpeg
 * @param videoFile The video file to convert
 * @returns A Blob URL for the converted video
 */
export const convertToPlayableFormat = async (videoFile: File): Promise<string> => {
  try {
    // Load FFmpeg if not already loaded
    const ffmpegInstance = await loadFFmpeg();
    
    // Write the input file to FFmpeg's virtual file system
    ffmpegInstance.FS('writeFile', videoFile.name, await fetchFile(videoFile));
    
    // Output filename
    const outputFileName = `output_${Date.now()}.mp4`;
    
    // Run FFmpeg command to convert to MP4
    await ffmpegInstance.run(
      '-i', videoFile.name, 
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-c:a', 'aac',
      '-f', 'mp4',
      outputFileName
    );
    
    // Read the output file
    const data = ffmpegInstance.FS('readFile', outputFileName);
    
    // Clean up temporary files
    ffmpegInstance.FS('unlink', videoFile.name);
    ffmpegInstance.FS('unlink', outputFileName);
    
    // Create a blob URL for the converted video
    const blob = new Blob([data.buffer], { type: 'video/mp4' });
    return URL.createObjectURL(blob);
  } catch (error) {
    console.error('Error converting video:', error);
    throw new Error('Failed to convert video format');
  }
};
