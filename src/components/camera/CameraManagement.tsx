
import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import CameraList from './CameraList';
import { Camera, VideoIcon } from 'lucide-react';
import VideoFeed from '../video/VideoFeed';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface CameraManagementProps {
  onCamerasChanged?: () => void;
}

const CameraManagement: React.FC<CameraManagementProps> = ({ onCamerasChanged }) => {
  const [rtspUrl, setRtspUrl] = useState('');
  const [isTestingStream, setIsTestingStream] = useState(false);
  
  const handleStreamTest = async () => {
    if (!rtspUrl) {
      toast.error('Please enter a stream URL');
      return;
    }
    
    setIsTestingStream(true);
    toast.info('Testing stream connection...', {
      description: 'Attempting to validate and connect to the stream'
    });
    
    try {
      // Use the check_stream endpoint to validate the stream URL
      const checkResponse = await fetch(`/transcode/check_stream?url=${encodeURIComponent(rtspUrl)}`);
      const validationResult = await checkResponse.json();
      
      console.log('Stream validation result:', validationResult);
      
      if (validationResult.accessible || validationResult.is_rtsp_stream) {
        toast.success('Stream connection successful', {
          description: validationResult.is_rtsp_stream 
            ? 'RTSP stream detected. Click "Start Video" to view.' 
            : 'Stream is accessible. Click "Start Video" to view.'
        });
      } else {
        toast.error('Stream connection failed', {
          description: validationResult.error 
            ? `Error: ${validationResult.error}` 
            : 'Make sure the URL is correct and the stream is accessible'
        });
      }
    } catch (error) {
      console.error('Error testing stream:', error);
      toast.error('Failed to test stream connection', {
        description: 'An error occurred while trying to validate the stream URL'
      });
    } finally {
      setIsTestingStream(false);
    }
  };

  return (
    <div>
      <Tabs defaultValue="cameras">
        <TabsList className="mb-4">
          <TabsTrigger value="cameras">
            <Camera className="mr-2 h-4 w-4" />
            Camera Management
          </TabsTrigger>
          <TabsTrigger value="stream-test">
            <VideoIcon className="mr-2 h-4 w-4" />
            Stream Test
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="cameras">
          <CameraList onCamerasChanged={onCamerasChanged} />
        </TabsContent>
        
        <TabsContent value="stream-test">
          <Card className="mb-6">
            <CardContent className="pt-6">
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="flex-1">
                    <Input
                      placeholder="Enter RTSP URL (e.g., rtsp://username:password@192.168.1.100:554/stream)"
                      value={rtspUrl}
                      onChange={(e) => setRtspUrl(e.target.value)}
                    />
                  </div>
                  <Button onClick={handleStreamTest} disabled={isTestingStream}>
                    {isTestingStream ? 'Testing...' : 'Test Connection'}
                  </Button>
                </div>
                
                <div className="text-sm text-muted-foreground">
                  <p className="mb-2">Common URL formats:</p>
                  <ul className="list-disc pl-5 space-y-1">
                    <li><strong>Hikvision:</strong> rtsp://username:password@192.168.1.100:554/Streaming/Channels/101</li>
                    <li><strong>Dahua:</strong> rtsp://username:password@192.168.1.100:554/cam/realmonitor?channel=1&subtype=0</li>
                    <li><strong>Axis:</strong> rtsp://username:password@192.168.1.100:554/axis-media/media.amp</li>
                    <li><strong>Generic ONVIF:</strong> rtsp://username:password@192.168.1.100:554/onvif/profile/media.smp</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <div className="aspect-video">
            <VideoFeed 
              initialVideoUrl={rtspUrl || "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4"}
              autoStart={rtspUrl.length > 0}
              // Force HLS mode for RTSP streams
              enableHLS={rtspUrl.startsWith('rtsp://') || rtspUrl.includes('.m3u8')}
            />
          </div>
          
          <div className="mt-4 p-4 border rounded-md bg-yellow-50 dark:bg-yellow-900/20">
            <p className="text-sm text-yellow-800 dark:text-yellow-300">
              <strong>Note:</strong> When using RTSP URLs, the server will automatically convert them to HLS format for web compatibility.
              For optimal performance, ensure that your camera's RTSP stream is accessible from the server where this application is running.
            </p>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default CameraManagement;
