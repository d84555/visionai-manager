
import React, { useState } from 'react';
import { Settings, Save } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';

const SettingsPage = () => {
  const [modelSettings, setModelSettings] = useState({
    confidenceThreshold: 70,
    detectionFrequency: 3,
    maxDetections: 10,
    useHighResolution: false,
  });
  
  const [videoSettings, setVideoSettings] = useState({
    defaultStreamUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
    autoStart: false,
    showOverlays: true,
    showLabels: true,
  });
  
  const [alertSettings, setAlertSettings] = useState({
    enableNotifications: true,
    soundAlerts: false,
    minimumConfidence: 85,
    automaticDismiss: false,
  });
  
  const handleSaveSettings = () => {
    // In a real app, this would save settings to a backend
    toast.success('Settings saved successfully');
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Settings</h1>
        <Button onClick={handleSaveSettings}>
          <Save className="mr-2" size={16} />
          Save Settings
        </Button>
      </div>
      
      <Card className="w-full">
        <CardHeader className="border-b">
          <CardTitle className="flex items-center">
            <Settings className="mr-2 text-avianet-red" size={20} />
            Application Settings
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <Tabs defaultValue="model">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="model">Model Settings</TabsTrigger>
              <TabsTrigger value="video">Video Settings</TabsTrigger>
              <TabsTrigger value="alerts">Alert Settings</TabsTrigger>
            </TabsList>
            
            <TabsContent value="model" className="space-y-6 pt-4">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="confidence-threshold">
                    Confidence Threshold ({modelSettings.confidenceThreshold}%)
                  </Label>
                  <Slider
                    id="confidence-threshold"
                    min={50}
                    max={95}
                    step={5}
                    value={[modelSettings.confidenceThreshold]}
                    onValueChange={(value) => setModelSettings({...modelSettings, confidenceThreshold: value[0]})}
                  />
                  <p className="text-xs text-muted-foreground">
                    Minimum confidence required for detection to be displayed (50-95%)
                  </p>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="detection-frequency">
                    Detection Frequency ({modelSettings.detectionFrequency}s)
                  </Label>
                  <Slider
                    id="detection-frequency"
                    min={1}
                    max={10}
                    step={1}
                    value={[modelSettings.detectionFrequency]}
                    onValueChange={(value) => setModelSettings({...modelSettings, detectionFrequency: value[0]})}
                  />
                  <p className="text-xs text-muted-foreground">
                    How often to run detection on video frames (1-10 seconds)
                  </p>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="max-detections">
                    Maximum Detections ({modelSettings.maxDetections})
                  </Label>
                  <Slider
                    id="max-detections"
                    min={5}
                    max={30}
                    step={5}
                    value={[modelSettings.maxDetections]}
                    onValueChange={(value) => setModelSettings({...modelSettings, maxDetections: value[0]})}
                  />
                  <p className="text-xs text-muted-foreground">
                    Maximum number of detections to display in a single frame
                  </p>
                </div>
                
                <div className="flex items-center space-x-2 pt-2">
                  <Switch
                    id="high-resolution"
                    checked={modelSettings.useHighResolution}
                    onCheckedChange={(checked) => setModelSettings({...modelSettings, useHighResolution: checked})}
                  />
                  <Label htmlFor="high-resolution">Use high resolution processing</Label>
                </div>
                <p className="text-xs text-muted-foreground pl-8">
                  Increases accuracy but requires more processing power
                </p>
              </div>
            </TabsContent>
            
            <TabsContent value="video" className="space-y-6 pt-4">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="default-stream">Default Stream URL</Label>
                  <Input
                    id="default-stream"
                    value={videoSettings.defaultStreamUrl}
                    onChange={(e) => setVideoSettings({...videoSettings, defaultStreamUrl: e.target.value})}
                    placeholder="Enter default video stream URL"
                  />
                </div>
                
                <div className="flex items-center space-x-2">
                  <Switch
                    id="auto-start"
                    checked={videoSettings.autoStart}
                    onCheckedChange={(checked) => setVideoSettings({...videoSettings, autoStart: checked})}
                  />
                  <Label htmlFor="auto-start">Auto-start video stream</Label>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Switch
                    id="show-overlays"
                    checked={videoSettings.showOverlays}
                    onCheckedChange={(checked) => setVideoSettings({...videoSettings, showOverlays: checked})}
                  />
                  <Label htmlFor="show-overlays">Show detection overlays</Label>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Switch
                    id="show-labels"
                    checked={videoSettings.showLabels}
                    onCheckedChange={(checked) => setVideoSettings({...videoSettings, showLabels: checked})}
                  />
                  <Label htmlFor="show-labels">Show detection labels</Label>
                </div>
              </div>
            </TabsContent>
            
            <TabsContent value="alerts" className="space-y-6 pt-4">
              <div className="space-y-4">
                <div className="flex items-center space-x-2">
                  <Switch
                    id="enable-notifications"
                    checked={alertSettings.enableNotifications}
                    onCheckedChange={(checked) => setAlertSettings({...alertSettings, enableNotifications: checked})}
                  />
                  <Label htmlFor="enable-notifications">Enable notifications</Label>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Switch
                    id="sound-alerts"
                    checked={alertSettings.soundAlerts}
                    onCheckedChange={(checked) => setAlertSettings({...alertSettings, soundAlerts: checked})}
                  />
                  <Label htmlFor="sound-alerts">Play sound for alerts</Label>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="min-confidence">
                    Minimum Alert Confidence ({alertSettings.minimumConfidence}%)
                  </Label>
                  <Slider
                    id="min-confidence"
                    min={70}
                    max={95}
                    step={5}
                    value={[alertSettings.minimumConfidence]}
                    onValueChange={(value) => setAlertSettings({...alertSettings, minimumConfidence: value[0]})}
                  />
                  <p className="text-xs text-muted-foreground">
                    Minimum confidence required to trigger an alert
                  </p>
                </div>
                
                <div className="flex items-center space-x-2 pt-2">
                  <Switch
                    id="auto-dismiss"
                    checked={alertSettings.automaticDismiss}
                    onCheckedChange={(checked) => setAlertSettings({...alertSettings, automaticDismiss: checked})}
                  />
                  <Label htmlFor="auto-dismiss">Automatically dismiss alerts after review</Label>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
      
      <Card className="w-full">
        <CardHeader className="border-b">
          <CardTitle>About</CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-medium">Avianet Vision</h3>
              <p className="text-sm text-muted-foreground">
                Advanced video analysis platform with object detection and event monitoring
              </p>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <h4 className="text-sm font-medium">Version</h4>
                <p className="text-sm text-muted-foreground">1.0.0</p>
              </div>
              <div>
                <h4 className="text-sm font-medium">Model</h4>
                <p className="text-sm text-muted-foreground">YOLOv11</p>
              </div>
              <div>
                <h4 className="text-sm font-medium">Last Updated</h4>
                <p className="text-sm text-muted-foreground">{new Date().toLocaleDateString()}</p>
              </div>
              <div>
                <h4 className="text-sm font-medium">Documentation</h4>
                <p className="text-sm">
                  <a href="#" className="text-blue-500 hover:underline">View Documentation</a>
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default SettingsPage;
