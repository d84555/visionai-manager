
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
type FFmpegFileData = Uint8Array | string | { buffer?: ArrayBuffer } | unknown;

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
    } else {
      // Check if data is object-like with a buffer property
      const dataObj = data as { buffer?: ArrayBuffer };
      if (dataObj && typeof dataObj === 'object' && dataObj.buffer && dataObj.buffer instanceof ArrayBuffer) {
        // If data has a buffer property (TypedArray-like)
        uint8Array = new Uint8Array(dataObj.buffer);
      } else {
        // Fallback approach - try to convert to string first
        console.warn('Unexpected FileData format, attempting conversion');
        const dataStr = String(data);
        uint8Array = new TextEncoder().encode(dataStr);
      }
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

// Create HLS Stream from RTSP URL
export async function createHlsStream(streamUrl: string, streamName: string = 'camera'): Promise<string> {
  try {
    const settings = getFFmpegSettings();
    
    // Always use server-side transcoding for RTSP streams
    if (!settings.serverTranscoding) {
      console.warn('Server-side transcoding is disabled but required for RTSP streams. Using server anyway.');
    }
    
    console.log('Sending stream request to backend with URL:', streamUrl);
    
    const formData = new FormData();
    formData.append('stream_url', streamUrl);
    formData.append('output_format', 'hls');
    formData.append('stream_name', streamName);
    
    console.log('Sending stream request to backend with parameters:', Object.fromEntries(formData.entries()));
    
    // Add timeout for stream creation request
    const response = await axios.post('/transcode/stream', formData, {
      timeout: 10000 // 10-second timeout
    });
    
    console.log('Stream response received:', response.data);
    
    // Check if we have a valid stream URL in the response
    if (!response.data.stream_url) {
      throw new Error('No stream URL returned from server');
    }
    
    // Return the stream URL path (this will be relative)
    return response.data.stream_url;
  } catch (error) {
    console.error('Error creating HLS stream:', error);
    toast.error('Failed to connect to camera', {
      description: 'Please check your camera URL, credentials, and network connection'
    });
    throw new Error(`Failed to create HLS stream: ${error instanceof Error ? error.message : String(error)}`);
  }
}
