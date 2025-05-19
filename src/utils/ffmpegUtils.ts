
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import axios from 'axios';
import SettingsService from '../services/SettingsService';

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
  const isHLSStream = fileName.endsWith('.m3u8') || fileName.endsWith('.m3u');
  
  return {
    isHikvision,
    isH264Raw,
    isH265Raw,
    isRawStream,
    isHLSStream,
    needsTranscoding: isHikvision || isRawStream || isHLSStream
  };
};

// Check if a URL is an HLS stream
export const isHLSStream = (url: string): boolean => {
  return url.toLowerCase().endsWith('.m3u8') || 
         url.toLowerCase().includes('.m3u8?') || 
         url.toLowerCase().includes('/index.m3u8');
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

// Client-side transcoding using FFmpeg.wasm
async function transcodeClientSide(file: File, formatInfo: any): Promise<string> {
  const settings = getFFmpegSettings();
  const ffmpeg = new FFmpeg();
  
  try {
    // Load FFmpeg with the correct core path
    const baseURL = settings.corePath || 'https://unpkg.com/@ffmpeg/core@0.11.0/dist';
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm')
    });
    
    const inputFileName = 'input_file';
    const outputFileName = 'output.mp4';
    
    // Use writeFile instead of FS.writeFile
    await ffmpeg.writeFile(inputFileName, await fetchFile(file));
    
    // Use exec instead of run
    await ffmpeg.exec([
      '-i', inputFileName,
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-c:a', 'aac',
      '-strict', 'experimental',
      outputFileName
    ]);
    
    // Use readFile instead of FS.readFile
    const fileData = await ffmpeg.readFile(outputFileName);
    
    // Create Blob from Uint8Array
    const blob = new Blob([fileData], { type: 'video/mp4' });
    
    // Clean up files using deleteFile
    await ffmpeg.deleteFile(inputFileName);
    await ffmpeg.deleteFile(outputFileName);
    
    return URL.createObjectURL(blob);
  } catch (error) {
    console.error('Error in client-side transcoding:', error);
    throw error;
  }
}

// Create HLS Stream from RTSP URL
export async function createHlsStream(streamUrl: string, streamName: string = 'camera'): Promise<string> {
  try {
    const settings = getFFmpegSettings();
    
    // Always use server-side transcoding for RTSP streams
    if (!settings.serverTranscoding) {
      console.warn('Server-side transcoding is disabled but required for RTSP streams. Using server anyway.');
    }
    
    const formData = new FormData();
    formData.append('stream_url', streamUrl);
    formData.append('output_format', 'hls');
    formData.append('stream_name', streamName);
    
    console.log('Sending stream request to backend with parameters:', Object.fromEntries(formData.entries()));
    
    // Use a relative URL to work with proxying
    const response = await axios.post('/transcode/stream', formData);
    
    console.log('Stream response received:', response.data);
    
    // Return the stream URL path (this will be relative)
    return response.data.stream_url;
  } catch (error) {
    console.error('Error creating HLS stream:', error);
    throw new Error(`Failed to create HLS stream: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Function to check if a URL is a direct HLS stream that can be played without transcoding
export const isDirectHLSStream = (url: string): boolean => {
  const lowerCaseUrl = url.toLowerCase();
  return (
    lowerCaseUrl.endsWith('.m3u8') ||
    lowerCaseUrl.includes('.m3u8?') ||
    lowerCaseUrl.includes('/index.m3u8') ||
    lowerCaseUrl.includes('/playlist.m3u8') ||
    lowerCaseUrl.includes('/manifest.m3u8')
  );
};
