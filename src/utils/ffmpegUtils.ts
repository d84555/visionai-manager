
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/ffmpeg/dist/esm/utils';
import { toBlobURL } from '@ffmpeg/util';
import SettingsService from '@/services/SettingsService';

// Create a singleton instance of FFmpeg
const getFFmpegInstance = async () => {
  // Load FFmpeg settings from our service 
  const ffmpegSettings = SettingsService.getSettings('ffmpeg');
  
  // Use the custom path if enabled, otherwise use default
  const corePath = ffmpegSettings.customPath ? 
    ffmpegSettings.corePath : 
    'https://unpkg.com/@ffmpeg/core@0.11.0/dist/ffmpeg-core.js';
  
  const ffmpeg = new FFmpeg();
  
  // Load the core, wasm, and worker
  const baseURL = 'https://unpkg.com/@ffmpeg/core@0.11.0/dist/';
  await ffmpeg.load({
    coreURL: await toBlobURL(`${baseURL}ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${baseURL}ffmpeg-core.wasm`, 'application/wasm'),
  });
  
  return ffmpeg;
};

// Initialize FFmpeg
let ffmpegInstance = null;
let isFFmpegLoaded = false;

export const loadFFmpeg = async () => {
  if (!isFFmpegLoaded) {
    try {
      ffmpegInstance = await getFFmpegInstance();
      isFFmpegLoaded = true;
    } catch (error) {
      console.error('Failed to load FFmpeg:', error);
      throw new Error('Failed to load video processing library');
    }
  }
  return ffmpegInstance;
};

/**
 * Converts a video file to MP4 format using FFmpeg
 * @param videoFile The video file to convert
 * @returns A Blob URL for the converted video
 */
export const convertToPlayableFormat = async (videoFile: File): Promise<string> => {
  try {
    // Load FFmpeg if not already loaded
    const ffmpeg = await loadFFmpeg();
    
    // Create a file name for input
    const inputFileName = videoFile.name;
    
    // Output filename
    const outputFileName = `output_${Date.now()}.mp4`;
    
    // Write the input file to FFmpeg's virtual file system
    await ffmpeg.writeFile(inputFileName, await fetchFile(videoFile));
    
    // Run FFmpeg command to convert to MP4
    await ffmpeg.exec([
      '-i', inputFileName, 
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-c:a', 'aac',
      '-f', 'mp4',
      outputFileName
    ]);
    
    // Read the output file
    const data = await ffmpeg.readFile(outputFileName);
    
    // Clean up temporary files
    await ffmpeg.deleteFile(inputFileName);
    await ffmpeg.deleteFile(outputFileName);
    
    // Create a blob URL for the converted video
    const blob = new Blob([data.buffer], { type: 'video/mp4' });
    return URL.createObjectURL(blob);
  } catch (error) {
    console.error('Error converting video:', error);
    throw new Error('Failed to convert video format');
  }
};
