import axios from 'axios';
import { toast } from 'sonner';

/**
 * Detects the video format and checks for Hikvision-specific formats
 * @param file The video file to analyze
 * @returns An object indicating the format details
 */
export function detectVideoFormat(file: File): { isHikvision: boolean } {
  const fileName = file.name.toLowerCase();
  return {
    isHikvision: fileName.endsWith('.dav') || fileName.endsWith('.mp4')
  };
}

/**
 * Converts a video file to a playable format using FFmpeg running in the browser
 * @param file The video file to convert
 * @returns A promise that resolves with the playable video URL
 */
export async function convertToPlayableFormat(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      if (!event.target || typeof event.target.result !== 'string') {
        reject(new Error('Failed to read the file.'));
        return;
      }
      resolve(event.target.result);
    };
    reader.onerror = (error) => {
      console.error("Error reading file:", error);
      reject(error);
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Creates a HLS stream from a source URL using server-side FFmpeg
 * @param sourceUrl URL of the source video stream
 * @param streamName Optional name for the stream
 * @returns URL to the HLS playlist
 */
export async function createHlsStream(sourceUrl: string, streamName: string = `stream_${Date.now()}`): Promise<string> {
  try {
    console.log(`Sending stream request to backend with parameters: ${JSON.stringify({
      stream_url: sourceUrl,
      output_format: 'hls',
      stream_name: streamName
    })}`);

    // Create form data for the request
    const formData = new FormData();
    formData.append('stream_url', sourceUrl);
    formData.append('output_format', 'hls');
    formData.append('stream_name', streamName);

    // Use relative URL for API endpoint for correct proxy handling
    const response = await axios.post('/transcode/stream', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });

    if (response.status !== 202 && response.status !== 200) {
      throw new Error(`Unexpected response status: ${response.status}`);
    }

    console.log('Stream response received:', response.data);

    // Extract the stream URL from the response
    const streamUrl = response.data.stream_url;
    
    // Return the relative path to the stream
    return streamUrl || response.data.stream_url;
  } catch (error) {
    console.error('Stream creation failed:', error);
    toast.error('Failed to create stream. Check your camera URL and try again.');
    throw error;
  }
}
