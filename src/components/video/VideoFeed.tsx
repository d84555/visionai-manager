import React, { useState, useEffect, useRef } from 'react';
import { AlertTriangle, Camera, VideoIcon, Play, Pause } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface Detection {
  id: string;
  class: string;
  confidence: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

const VideoFeed: React.FC = () => {
  const [videoUrl, setVideoUrl] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [detections, setDetections] = useState<Detection[]>([]);
  const [resolution, setResolution] = useState({ width: 640, height: 360 });
  const [isPlaying, setIsPlaying] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const detectObjects = () => {
    const mockClasses = ['person', 'car', 'truck', 'bicycle', 'motorcycle', 'bus'];
    const newDetections: Detection[] = [];
    
    const count = Math.floor(Math.random() * 5) + 1;
    
    for (let i = 0; i < count; i++) {
      const classIndex = Math.floor(Math.random() * mockClasses.length);
      const confidence = 0.5 + Math.random() * 0.5;
      
      const width = 50 + Math.random() * 150;
      const height = 50 + Math.random() * 100;
      const x = Math.random() * (resolution.width - width);
      const y = Math.random() * (resolution.height - height);
      
      newDetections.push({
        id: `det-${Date.now()}-${i}`,
        class: mockClasses[classIndex],
        confidence,
        x,
        y,
        width,
        height
      });
    }
    
    setDetections(newDetections);
    
    newDetections.forEach(detection => {
      if (detection.confidence > 0.85) {
        toast.warning(`High confidence detection: ${detection.class}`, {
          description: `Confidence: ${(detection.confidence * 100).toFixed(1)}%`
        });
      }
    });
  };

  const startStream = () => {
    if (!videoUrl) {
      toast.error('Please enter a valid video URL');
      return;
    }
    
    setIsStreaming(true);
    setIsPlaying(true);
    toast.success('Video stream started', {
      description: 'Object detection is now active'
    });
    
    const interval = setInterval(detectObjects, 3000);
    
    return () => clearInterval(interval);
  };

  const stopStream = () => {
    setIsStreaming(false);
    setDetections([]);
    setIsPlaying(false);
    if (videoRef.current) {
      videoRef.current.pause();
    }
    toast.info('Video stream stopped');
  };

  const togglePlayPause = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const localUrl = URL.createObjectURL(file);
      setVideoUrl(localUrl);
      toast.success('Local video file loaded');
    }
  };

  const handleVideoMetadata = () => {
    if (videoRef.current) {
      setResolution({
        width: videoRef.current.videoWidth,
        height: videoRef.current.videoHeight
      });
    }
  };

  const handleVideoError = () => {
    toast.error('Failed to load video', {
      description: 'The video URL may be invalid or inaccessible'
    });
    stopStream();
  };

  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const containerWidth = containerRef.current.offsetWidth;
        const aspectRatio = resolution.height / resolution.width;
        setResolution({
          width: containerWidth,
          height: containerWidth * aspectRatio
        });
      }
    };

    window.addEventListener('resize', updateSize);
    updateSize();

    return () => window.removeEventListener('resize', updateSize);
  }, [isStreaming, resolution.width, resolution.height]);

  return (
    <Card className="w-full">
      <CardHeader className="border-b">
        <CardTitle className="flex items-center">
          <Camera className="mr-2 text-avianet-red" size={20} />
          Real-time Video Feed
        </CardTitle>
      </CardHeader>
      <CardContent className="p-6">
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <Label htmlFor="video-url">Video Stream URL</Label>
              <div className="flex mt-1">
                <Input
                  id="video-url"
                  placeholder="Enter video URL..."
                  value={videoUrl}
                  onChange={(e) => setVideoUrl(e.target.value)}
                  className="rounded-r-none"
                />
                <Button
                  variant={isStreaming ? "destructive" : "default"}
                  onClick={isStreaming ? stopStream : startStream}
                  className="rounded-l-none"
                >
                  {isStreaming ? "Stop" : "Start"}
                </Button>
              </div>
            </div>
          </div>
          
          <div className="flex flex-wrap gap-2 items-center">
            <div className="flex-1">
              <Label htmlFor="video-file">Or upload a local video file:</Label>
              <Input
                id="video-file"
                type="file"
                accept="video/*"
                onChange={handleFileUpload}
                className="mt-1"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setVideoUrl('https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4')}
              className="text-xs"
            >
              Demo Video 1
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setVideoUrl('https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4')}
              className="text-xs"
            >
              Demo Video 2
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setVideoUrl('https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4')}
              className="text-xs"
            >
              Demo Video 3
            </Button>
          </div>

          <div className="video-feed mt-4 relative" ref={containerRef}>
            {isStreaming ? (
              <div className="relative">
                <video
                  ref={videoRef}
                  src={videoUrl}
                  width={resolution.width}
                  height={resolution.height}
                  onLoadedMetadata={handleVideoMetadata}
                  onError={handleVideoError}
                  autoPlay
                  muted
                  loop
                  playsInline
                  className="w-full"
                />
                
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="absolute bottom-4 right-4 bg-black/50 text-white hover:bg-black/70"
                  onClick={togglePlayPause}
                >
                  {isPlaying ? <Pause size={18} /> : <Play size={18} />}
                </Button>
                
                {detections.map((detection) => (
                  <div
                    key={detection.id}
                    className="absolute border-2 border-avianet-red"
                    style={{
                      left: `${detection.x}px`,
                      top: `${detection.y}px`,
                      width: `${detection.width}px`,
                      height: `${detection.height}px`
                    }}
                  >
                    <span 
                      className="absolute top-0 left-0 bg-avianet-red text-white text-xs px-1 py-0.5 max-w-full overflow-hidden text-ellipsis"
                    >
                      {detection.class} ({(detection.confidence * 100).toFixed(0)}%)
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center bg-gray-100 dark:bg-gray-800 rounded-md" style={{ height: '360px' }}>
                <VideoIcon className="text-gray-400 mb-2" size={48} />
                <p className="text-gray-500 dark:text-gray-400">No video stream active</p>
                <p className="text-gray-400 dark:text-gray-500 text-sm mt-1">Enter a URL and click Start to begin</p>
              </div>
            )}
          </div>
          
          {isStreaming && detections.length === 0 && (
            <div className="flex items-center justify-center p-4 bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400 rounded-md">
              <AlertTriangle className="mr-2" size={16} />
              <span className="text-sm">Running object detection...</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default VideoFeed;
