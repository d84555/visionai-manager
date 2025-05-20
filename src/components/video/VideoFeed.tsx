
import React from 'react';
import { useVideoFeed } from '@/hooks/useVideoFeed';
import { VideoControls } from './VideoControls';
import { DetectionOverlay } from './DetectionOverlay';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';

export interface VideoFeedProps {
  initialVideoUrl?: string;
  autoStart?: boolean;
  camera?: {
    id: string;
    name: string;
    streamUrl: {
      main: string;
      sub: string;
    };
  };
  activeModels?: { name: string; path: string }[];
  streamType?: 'main' | 'sub';
  fps?: number;
  enableHLS?: boolean;
  showControls?: boolean;  // Add the showControls prop
  isPinned?: boolean;      // Add isPinned prop
  onPinToggle?: () => void; // Add onPinToggle prop
}

const VideoFeed: React.FC<VideoFeedProps> = ({ 
  initialVideoUrl = '', 
  autoStart = false,
  camera,
  activeModels = [],
  streamType = 'main',
  fps = 10,
  enableHLS = true,
  showControls = true,  // Default to true for controls
  isPinned,
  onPinToggle
}) => {
  const { 
    videoUrl,
    setVideoUrl,
    isStreaming,
    isPlaying,
    detections,
    resolution,
    isProcessing,
    hasUploadedFile,
    inferenceLocation,
    inferenceTime,
    actualFps,
    isHikvisionFormat,
    isModelLoading,
    formatNotSupported,
    streamProcessing,
    isLiveStream,
    videoRef,
    containerRef,
    startStream,
    stopStream,
    togglePlayPause,
    handleFileUpload,
    handleVideoMetadata,
    handleVideoError
  } = useVideoFeed({ 
    initialVideoUrl, 
    autoStart,
    camera,
    activeModels,
    streamType,
    fps,
    enableHLS
  });

  return (
    <div ref={containerRef} className="relative flex flex-col overflow-hidden rounded-lg">
      {/* Loading overlay for stream processing */}
      {streamProcessing && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black bg-opacity-60">
          <div className="flex flex-col items-center space-y-2 text-white">
            <Loader2 className="h-8 w-8 animate-spin" />
            <p>Processing stream...</p>
          </div>
        </div>
      )}
      
      {/* Loading overlay for model loading */}
      {isModelLoading && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black bg-opacity-60">
          <div className="flex flex-col items-center space-y-2 text-white">
            <Loader2 className="h-8 w-8 animate-spin" />
            <p>Loading AI models...</p>
          </div>
        </div>
      )}
      
      {/* Processing overlay */}
      {isProcessing && !streamProcessing && !isModelLoading && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black bg-opacity-60">
          <div className="flex flex-col items-center space-y-2 text-white">
            <Loader2 className="h-8 w-8 animate-spin" />
            <p>Processing video...</p>
          </div>
        </div>
      )}
      
      {/* Format not supported message */}
      {formatNotSupported && (
        <Card className="absolute inset-0 z-20 flex items-center justify-center bg-red-50 dark:bg-red-900/20">
          <CardContent className="flex flex-col items-center justify-center p-6 text-center">
            <h3 className="mb-2 text-xl font-bold text-red-700 dark:text-red-300">Video Format Not Supported</h3>
            <p className="text-sm text-red-600 dark:text-red-300">
              Your browser cannot play this video format directly. Please enable server-side transcoding in Settings or try a different format.
            </p>
          </CardContent>
        </Card>
      )}
      
      <video
        ref={videoRef}
        className="h-auto w-full bg-black"
        autoPlay={autoStart}
        playsInline
        muted
        onLoadedMetadata={handleVideoMetadata}
        onError={handleVideoError}
        controls={false}
      >
        <source src={videoUrl} type="video/mp4" />
        Your browser does not support the video tag.
      </video>
      
      <DetectionOverlay 
        detections={detections} 
        videoRef={videoRef}
        inferenceLocation={inferenceLocation}
        inferenceTime={inferenceTime}
        actualFps={actualFps}
      />
      
      {showControls && (
        <VideoControls
          isStreaming={isStreaming}
          isPlaying={isPlaying}
          isPinned={isPinned}
          onPinToggle={onPinToggle}
          onPlayPause={togglePlayPause}
          onPlay={startStream}
          onStop={stopStream}
          onFileUpload={handleFileUpload}
          videoUrl={videoUrl}
          setVideoUrl={setVideoUrl}
          hasUploadedFile={hasUploadedFile}
          isLiveStream={isLiveStream}
          inferenceLocation={inferenceLocation}
          inferenceTime={inferenceTime}
          isHikvisionFormat={isHikvisionFormat}
        />
      )}
    </div>
  );
};

export default VideoFeed;
