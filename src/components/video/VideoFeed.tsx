
import React, { useRef, useState, useEffect } from 'react';
import { useVideoFeed } from '@/hooks/useVideoFeed';
import { useHLSPlayer } from '@/hooks/useHLSPlayer';
import { VideoControls } from '@/components/video/VideoControls';
import { DetectionOverlay } from '@/components/video/DetectionOverlay';
import { CanvasDetectionOverlay } from '@/components/video/CanvasDetectionOverlay';
import { ModelSelector } from '@/components/video/ModelSelector';

export interface VideoFeedProps {
  initialVideoUrl?: string;
  autoStart?: boolean;
  showControls?: boolean;
  isPinned?: boolean;
  onPinToggle?: () => void;
  activeModels?: { name: string; path: string; }[];
  streamType?: 'main' | 'sub';
  camera?: any;
  enableHLS?: boolean;
  showDetections?: boolean;
  onFrameCaptured?: (blob: Blob) => void;
}

const VideoFeed: React.FC<VideoFeedProps> = ({
  initialVideoUrl,
  autoStart = false,
  showControls = true,
  isPinned = false,
  onPinToggle,
  activeModels = [],
  streamType = 'main',
  camera,
  enableHLS = false,
  showDetections = true,
  onFrameCaptured
}) => {
  // Use ref for the wrapper element
  const wrapperRef = useRef<HTMLDivElement>(null);
  
  // Use video hooks
  const {
    videoRef,
    isPlaying,
    isStreaming,
    isHikvisionFormat,
    isLiveStream,
    inferenceTime,
    inferenceLocation,
    actualFps,
    detections,
    formatNotSupported,
    togglePlayPause,
    stopStream,
    startStream,
    handleFileUpload,
    canvasRef,
    isDebugMode
  } = useVideoFeed({
    initialVideoUrl: initialVideoUrl || camera?.streamUrl,
    autoStart,
    activeModels,
    camera,
    enableHLS
  });
  
  // Use HLS player if enabled
  const { error: hlsError, isHLSSource, isHlsSupported } = useHLSPlayer({
    videoRef,
    enabled: enableHLS
  });
  
  const hlsLoading = isHLSSource && !hlsError && !videoRef.current?.readyState;
  
  // Handle pin toggle
  const handlePinToggle = () => {
    if (onPinToggle) {
      onPinToggle();
    }
  };

  // Callback for play/pause button
  const handlePlayPause = () => {
    togglePlayPause();
  };

  // Capture a frame when requested
  useEffect(() => {
    if (onFrameCaptured && videoRef.current && isPlaying) {
      const captureInterval = setInterval(() => {
        const video = videoRef.current;
        if (!video) return;

        // Create a canvas to capture the frame
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        
        if (ctx) {
          // Draw the current frame to the canvas
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          
          // Convert to blob and send to callback
          canvas.toBlob((blob) => {
            if (blob) {
              onFrameCaptured(blob);
            }
          }, 'image/jpeg', 0.95);
        }
      }, 10000); // Capture every 10 seconds
      
      return () => clearInterval(captureInterval);
    }
  }, [onFrameCaptured, isPlaying, videoRef]);

  return (
    <div 
      ref={wrapperRef}
      className="relative w-full h-full overflow-hidden bg-black flex items-center justify-center"
    >
      <video
        ref={videoRef}
        className="max-w-full max-h-full"
        playsInline
        muted
      />
      
      {showDetections && detections && detections.length > 0 && (
        <DetectionOverlay 
          detections={detections}
          videoRef={videoRef}
          inferenceLocation={inferenceLocation}
          inferenceTime={inferenceTime}
          actualFps={actualFps}
        />
      )}
      
      {showControls && (
        <VideoControls
          isPlaying={isPlaying}
          isPinned={isPinned}
          onPinToggle={handlePinToggle}
          onPlayPause={handlePlayPause}
          inferenceLocation={inferenceLocation}
          inferenceTime={inferenceTime}
          isHikvisionFormat={isHikvisionFormat}
          isLiveStream={isLiveStream}
          isStreaming={isStreaming}
          onPlay={startStream}
          onStop={stopStream}
          onFileUpload={handleFileUpload}
          formatNotSupported={formatNotSupported}
          showMinimalControls={false}
        />
      )}
      
      {canvasRef && isDebugMode && (
        <div className="absolute inset-0 pointer-events-none">
          <canvas
            ref={canvasRef}
            className="absolute top-0 left-0 w-full h-full"
          />
        </div>
      )}
      
      {hlsLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-white">
          <p>Loading HLS stream...</p>
        </div>
      )}
      
      {hlsError && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-white">
          <p>Error loading HLS stream</p>
        </div>
      )}
      
      {formatNotSupported && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70 text-white">
          <div className="text-center p-4">
            <p className="mb-2">This video format is not supported by your browser.</p>
            <p className="text-sm text-gray-300">Try uploading a different file format or using a different browser.</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default VideoFeed;
