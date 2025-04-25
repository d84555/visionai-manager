import React, { useState, useEffect } from 'react';
import { Settings, Save, Mail, Database, Logs, Server, Layers } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel } from '@/components/ui/form';
import { toast } from 'sonner';
import SyslogConfig from '@/components/config/SyslogConfig';
import SmtpConfig from '@/components/config/SmtpConfig';
import StorageConfig from '@/components/config/StorageConfig';
import ModelSelector from '@/components/ai/ModelSelector';
import SettingsService, { 
  ModelSettings, 
  VideoSettings, 
  AlertSettings, 
  FFmpegSettings 
} from '@/services/SettingsService';

const SettingsPage = () => {
  const [modelSettings, setModelSettings] = useState<ModelSettings>({
    confidenceThreshold: 70,
    detectionFrequency: 3,
    maxDetections: 10,
    useHighResolution: false,
    autoApplyModel: true,
  });
  
  const [videoSettings, setVideoSettings] = useState<VideoSettings>({
    defaultStreamUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
    autoStart: false,
    showOverlays: true,
    showLabels: true,
  });
  
  const [alertSettings, setAlertSettings] = useState<AlertSettings>({
    enableNotifications: true,
    soundAlerts: false,
    minimumConfidence: 85,
    automaticDismiss: false,
  });
  
  const [ffmpegSettings, setFfmpegSettings] = useState<FFmpegSettings>({
    corePath: 'https://unpkg.com/@ffmpeg/core@0.11.0/dist/ffmpeg-core.js',
    customPath: false,
    localBinaryPath: '/usr/bin/ffmpeg',
    useLocalBinary: false
  });

  useEffect(() => {
    const loadedModelSettings = SettingsService.getSettings('model');
    const loadedVideoSettings = SettingsService.getSettings('video');
    const loadedAlertSettings = SettingsService.getSettings('alerts');
    const loadedFfmpegSettings = SettingsService.getSettings('ffmpeg');
    
    setModelSettings(loadedModelSettings);
    setVideoSettings(loadedVideoSettings);
    setAlertSettings(loadedAlertSettings);
    setFfmpegSettings(loadedFfmpegSettings);
  }, []);

  useEffect(() => {
    SettingsService.updateSettings('model', modelSettings);
  }, [modelSettings]);

  useEffect(() => {
    SettingsService.updateSettings('video', videoSettings);
  }, [videoSettings]);

  useEffect(() => {
    SettingsService.updateSettings('alerts', alertSettings);
  }, [alertSettings]);

  useEffect(() => {
    SettingsService.updateSettings('ffmpeg', ffmpegSettings);
  }, [ffmpegSettings]);
  
  const handleSaveSettings = () => {
    SettingsService.saveAllSettings({
      model: modelSettings,
      video: videoSettings,
      alerts: alertSettings,
      syslog: SettingsService.getSettings('syslog'),
      smtp: SettingsService.getSettings('smtp'),
      storage: SettingsService.getSettings('storage'),
      ffmpeg: ffmpegSettings,
      gridLayout: SettingsService.getSettings('gridLayout'),
    });

    if (ffmpegSettings.customPath) {
      localStorage.setItem('ffmpeg-core-path', ffmpegSettings.corePath);
    } else {
      localStorage.removeItem('ffmpeg-core-path');
    }
    
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
            <Layers className="mr-2 text-avianet-red" size={20} />
            AI Models Configuration
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <ModelSelector />
        </CardContent>
      </Card>
      
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
          <CardTitle className="flex items-center">
            <Logs className="mr-2 text-avianet-red" size={20} />
            Alert Integration
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <SyslogConfig />
        </CardContent>
      </Card>

      <Card className="w-full">
        <CardHeader className="border-b">
          <CardTitle className="flex items-center">
            <Mail className="mr-2 text-avianet-red" size={20} />
            SMTP Configuration
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <SmtpConfig />
        </CardContent>
      </Card>

      <Card className="w-full">
        <CardHeader className="border-b">
          <CardTitle className="flex items-center">
            <Database className="mr-2 text-avianet-red" size={20} />
            Violation Event Storage
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <StorageConfig />
        </CardContent>
      </Card>
      
      <Card className="w-full">
        <CardHeader className="border-b">
          <CardTitle className="flex items-center">
            <Settings className="mr-2 text-avianet-red" size={20} />
            FFmpeg Configuration
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <Switch
                id="use-local-ffmpeg"
                checked={ffmpegSettings.useLocalBinary}
                onCheckedChange={(checked) => setFfmpegSettings({...ffmpegSettings, useLocalBinary: checked})}
              />
              <Label htmlFor="use-local-ffmpeg">Use local FFmpeg binary installation</Label>
            </div>
            
            {ffmpegSettings.useLocalBinary && (
              <div className="space-y-2">
                <Label htmlFor="ffmpeg-local-path">FFmpeg Binary Path</Label>
                <Input
                  id="ffmpeg-local-path"
                  value={ffmpegSettings.localBinaryPath || '/usr/bin/ffmpeg'}
                  onChange={(e) => setFfmpegSettings({...ffmpegSettings, localBinaryPath: e.target.value})}
                  placeholder="Enter path to FFmpeg binary (e.g. /usr/bin/ffmpeg)"
                />
                <p className="text-xs text-muted-foreground">
                  Default path for Unix: /usr/bin/ffmpeg, Windows: C:\ffmpeg\bin\ffmpeg.exe
                </p>
              </div>
            )}
            
            {!ffmpegSettings.useLocalBinary && (
              <>
                <div className="flex items-center space-x-2">
                  <Switch
                    id="custom-ffmpeg"
                    checked={ffmpegSettings.customPath}
                    onCheckedChange={(checked) => setFfmpegSettings({...ffmpegSettings, customPath: checked})}
                  />
                  <Label htmlFor="custom-ffmpeg">Use custom FFmpeg WebAssembly core path</Label>
                </div>
                
                {ffmpegSettings.customPath && (
                  <div className="space-y-2">
                    <Label htmlFor="ffmpeg-path">FFmpeg Core Path</Label>
                    <Input
                      id="ffmpeg-path"
                      value={ffmpegSettings.corePath}
                      onChange={(e) => setFfmpegSettings({...ffmpegSettings, corePath: e.target.value})}
                      placeholder="Enter FFmpeg core path"
                    />
                    <p className="text-xs text-muted-foreground">
                      Default path: https://unpkg.com/@ffmpeg/core@0.11.0/dist/ffmpeg-core.js
                    </p>
                  </div>
                )}
              </>
            )}
            
            <div className="mt-4 p-3 border rounded-md bg-yellow-50">
              <p className="text-sm text-amber-800">
                <strong>Note:</strong> Using a local FFmpeg binary requires FFmpeg to be installed on your system.
                The web application cannot directly access local system binaries due to browser security restrictions.
                This option is intended for cases where video processing happens server-side.
              </p>
            </div>
          </div>
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
