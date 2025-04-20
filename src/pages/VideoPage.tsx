
import React from 'react';
import VideoFeed from '@/components/video/VideoFeed';
import { Cpu } from 'lucide-react';

const VideoPage = () => {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Video Stream</h1>
      </div>
      
      <VideoFeed />
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="border rounded-md p-4">
          <h2 className="text-lg font-medium mb-2">Video Stream Usage</h2>
          <p className="text-sm text-muted-foreground mb-4">
            The video stream displays real-time or recorded footage with AI-powered object detection overlays. The YOLOv11 model identifies and classifies objects in the video feed.
          </p>
          <h3 className="text-md font-medium mb-1">Instructions:</h3>
          <ol className="list-decimal list-inside text-sm text-muted-foreground space-y-1 ml-2">
            <li>Enter a valid video stream URL in the input field</li>
            <li>Or upload a local video file from your device</li>
            <li>Click the "Start" button to begin streaming and object detection</li>
            <li>Object detection results appear as overlays on the video</li>
            <li>Click "Stop" to end the stream</li>
          </ol>
        </div>
        
        <div className="border rounded-md p-4">
          <h2 className="text-lg font-medium mb-2">Detection Settings</h2>
          <p className="text-sm text-muted-foreground mb-3">
            The default detection settings work for most scenarios. For advanced configuration, visit the Settings page.
          </p>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Detection threshold:</span>
              <span className="font-medium">70%</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>Processing resolution:</span>
              <span className="font-medium">640x360</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>Detection frequency:</span>
              <span className="font-medium">Every 3 seconds</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>Model:</span>
              <span className="font-medium">YOLOv11</span>
            </div>
          </div>
        </div>
        
        <div className="border rounded-md p-4">
          <h2 className="flex items-center text-lg font-medium mb-2">
            <Cpu className="mr-2 text-avianet-red" size={18} />
            FFmpeg Encoding
          </h2>
          <p className="text-sm text-muted-foreground mb-3">
            The system includes an integrated FFmpeg encoder to support a wide range of video formats that may not be natively playable in browsers.
          </p>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Encoder:</span>
              <span className="font-medium">FFmpeg.wasm</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>Output format:</span>
              <span className="font-medium">MP4 (H.264)</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>Processing:</span>
              <span className="font-medium">Client-side</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>Supported inputs:</span>
              <span className="font-medium">Most video formats</span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Note: Processing large video files may take some time as encoding happens in your browser.
          </p>
        </div>
      </div>
    </div>
  );
};

export default VideoPage;
