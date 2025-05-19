
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAlertSources } from '@/hooks/useAlertSources';
import { Badge } from '@/components/ui/badge';
import { AlertProvider } from '@/contexts/AlertContext';
import { Bell, Video, X } from 'lucide-react';
import { toast } from "sonner";

const AlertSourcesConfig = () => {
  const [newRtspUrl, setNewRtspUrl] = useState('');
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  
  const {
    rtspFeeds,
    addRtspFeed,
    removeRtspFeed,
    uploadedVideos,
    addUploadedVideo,
    removeUploadedVideo,
    isConnected,
    connect,
    disconnect
  } = useAlertSources();
  
  const handleAddRtspFeed = () => {
    if (newRtspUrl && newRtspUrl.trim().startsWith('rtsp://')) {
      addRtspFeed(newRtspUrl);
      setNewRtspUrl('');
      toast.success("RTSP feed added successfully");
    } else {
      toast.error("Please enter a valid RTSP URL starting with rtsp://");
    }
  };
  
  const handleUploadVideo = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!videoFile) {
      toast.error("Please select a video file to upload");
      return;
    }
    
    // In a real app, this would upload to a server
    // For now, we'll simulate the upload and use a local URL
    const simulateUpload = () => {
      let progress = 0;
      const interval = setInterval(() => {
        progress += 5;
        setUploadProgress(progress);
        
        if (progress >= 100) {
          clearInterval(interval);
          setUploadProgress(null);
          
          // Create a local object URL (in a real app, this would be a server URL)
          const objectUrl = URL.createObjectURL(videoFile);
          addUploadedVideo(objectUrl);
          
          toast.success(`Video "${videoFile.name}" uploaded successfully`);
          setVideoFile(null);
        }
      }, 100);
    };
    
    simulateUpload();
  };
  
  return (
    <AlertProvider>
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Bell className="mr-2" size={18} />
              Alert Data Sources Configuration
            </CardTitle>
            <CardDescription>
              Configure RTSP streams and upload videos for alert generation
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="rtsp" className="w-full">
              <TabsList>
                <TabsTrigger value="rtsp">RTSP Streams</TabsTrigger>
                <TabsTrigger value="upload">Video Upload</TabsTrigger>
              </TabsList>
              
              <TabsContent value="rtsp" className="space-y-4 pt-4">
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <Input 
                      placeholder="Enter RTSP URL (rtsp://...)" 
                      value={newRtspUrl}
                      onChange={(e) => setNewRtspUrl(e.target.value)}
                    />
                  </div>
                  <Button onClick={handleAddRtspFeed}>Add Stream</Button>
                </div>
                
                <div className="mt-4">
                  <h3 className="text-sm font-medium mb-2">Connected RTSP Feeds</h3>
                  {rtspFeeds.length > 0 ? (
                    <div className="space-y-2">
                      {rtspFeeds.map((feed, index) => (
                        <div key={feed + index} className="flex items-center justify-between p-2 bg-muted/40 rounded-md">
                          <div className="flex items-center">
                            <Video className="mr-2 text-muted-foreground" size={16} />
                            <span className="text-sm truncate max-w-[400px]" title={feed}>{feed}</span>
                          </div>
                          <Button 
                            size="icon" 
                            variant="ghost" 
                            onClick={() => removeRtspFeed(feed)}
                            title="Remove feed"
                          >
                            <X size={16} />
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No RTSP feeds configured</p>
                  )}
                </div>
              </TabsContent>
              
              <TabsContent value="upload" className="space-y-4 pt-4">
                <form onSubmit={handleUploadVideo} className="space-y-4">
                  <div className="flex flex-col gap-2">
                    <Input 
                      type="file" 
                      accept="video/*"
                      onChange={(e) => setVideoFile(e.target.files?.[0] || null)}
                    />
                    {uploadProgress !== null && (
                      <div className="w-full bg-muted rounded-full h-2.5">
                        <div 
                          className="bg-primary h-2.5 rounded-full" 
                          style={{ width: `${uploadProgress}%` }}
                        ></div>
                      </div>
                    )}
                  </div>
                  
                  <Button type="submit" disabled={!videoFile || uploadProgress !== null}>
                    Upload Video
                  </Button>
                </form>
                
                <div className="mt-4">
                  <h3 className="text-sm font-medium mb-2">Uploaded Videos</h3>
                  {uploadedVideos.length > 0 ? (
                    <div className="space-y-2">
                      {uploadedVideos.map((video, index) => (
                        <div key={video + index} className="flex items-center justify-between p-2 bg-muted/40 rounded-md">
                          <div className="flex items-center">
                            <Video className="mr-2 text-muted-foreground" size={16} />
                            <span className="text-sm truncate max-w-[400px]" title={video}>
                              {video.includes('/') ? video.split('/').pop() : video}
                            </span>
                          </div>
                          <Button 
                            size="icon" 
                            variant="ghost" 
                            onClick={() => removeUploadedVideo(video)}
                            title="Remove video"
                          >
                            <X size={16} />
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No videos uploaded</p>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
          <CardFooter className="flex justify-between">
            <div className="flex items-center">
              <Badge variant={isConnected ? 'default' : 'outline'} className="mr-2">
                {isConnected ? 'Connected' : 'Disconnected'}
              </Badge>
              <span className="text-sm text-muted-foreground">
                {rtspFeeds.length} streams, {uploadedVideos.length} videos
              </span>
            </div>
            <div className="space-x-2">
              <Button 
                variant="outline" 
                onClick={disconnect} 
                disabled={!isConnected}
              >
                Disconnect
              </Button>
              <Button 
                onClick={connect}
                disabled={isConnected}
              >
                Connect
              </Button>
            </div>
          </CardFooter>
        </Card>
      </div>
    </AlertProvider>
  );
};

export default AlertSourcesConfig;
