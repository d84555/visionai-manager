import React, { useState, useEffect } from 'react';
import { Settings, Save, Mail, Database, Logs, Server, Layers, Info, Upload, Type, Image, Palette } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel } from '@/components/ui/form';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import SyslogConfig from '@/components/config/SyslogConfig';
import SmtpConfig from '@/components/config/SmtpConfig';
import StorageConfig from '@/components/config/StorageConfig';
import ModelSelector from '@/components/ai/ModelSelector';
import StorageServiceFactory from '@/services/storage/StorageServiceFactory';
import SettingsService, { 
  ModelSettings, 
  VideoSettings, 
  AlertSettings, 
  FFmpegSettings 
} from '@/services/SettingsService';

interface BrandingSettings {
  logoUrl: string;
  customFooterText: string;
  useCustomFooter: boolean;
}

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
    useLocalBinary: false,
    serverBinaryPath: '/usr/bin/ffmpeg',
    useServerBinary: false,
    serverTranscoding: false,
    transcodeFormat: 'hls'
  });

  const [brandingSettings, setBrandingSettings] = useState<BrandingSettings>({
    logoUrl: '',
    customFooterText: '',
    useCustomFooter: false,
  });

  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const currentYear = new Date().getFullYear();

  const [storageMode, setStorageMode] = useState<'simulated' | 'api'>(
    StorageServiceFactory.getMode()
  );

  useEffect(() => {
    const loadedModelSettings = SettingsService.getSettings('model');
    const loadedVideoSettings = SettingsService.getSettings('video');
    const loadedAlertSettings = SettingsService.getSettings('alerts');
    const loadedFfmpegSettings = SettingsService.getSettings('ffmpeg');
    const loadedBrandingSettings = SettingsService.getSettings('branding');
    
    setModelSettings(loadedModelSettings);
    setVideoSettings(loadedVideoSettings);
    setAlertSettings(loadedAlertSettings);
    setFfmpegSettings(loadedFfmpegSettings);
    
    if (loadedBrandingSettings) {
      setBrandingSettings(loadedBrandingSettings);
      if (loadedBrandingSettings.logoUrl) {
        setLogoPreview(loadedBrandingSettings.logoUrl);
      }
    }
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

  useEffect(() => {
    SettingsService.updateSettings('branding', brandingSettings);
  }, [brandingSettings]);

  const handleStorageModeChange = (mode: 'simulated' | 'api') => {
    StorageServiceFactory.setMode(mode);
    setStorageMode(mode);
    toast.success(`Storage mode changed to ${mode === 'api' ? 'Edge Computing Node' : 'Browser Simulation'}`);
  };
  
  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setSelectedFile(file);
    
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      setLogoPreview(result);
      
      // Store the data URL in settings
      setBrandingSettings({
        ...brandingSettings,
        logoUrl: result
      });
    };
    
    reader.readAsDataURL(file);
  };
  
  const handleFooterTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setBrandingSettings({
      ...brandingSettings,
      customFooterText: e.target.value
    });
  };
  
  const handleUseCustomFooter = (checked: boolean) => {
    setBrandingSettings({
      ...brandingSettings,
      useCustomFooter: checked
    });
  };
  
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
      branding: brandingSettings,
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
            <Palette className="mr-2 text-avianet-red" size={20} />
            Branding Configuration
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <div className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="logo-upload">Custom Logo</Label>
              <div className="flex items-center gap-4">
                <div className="w-32 h-32 border rounded flex items-center justify-center overflow-hidden bg-gray-50 dark:bg-gray-800">
                  {logoPreview ? (
                    <img 
                      src={logoPreview} 
                      alt="Logo Preview" 
                      className="max-w-full max-h-full object-contain" 
                    />
                  ) : (
                    <Image className="text-gray-400" size={36} />
                  )}
                </div>
                <div className="flex-1">
                  <Input
                    id="logo-upload"
                    type="file"
                    accept="image/*"
                    onChange={handleLogoUpload}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Recommended size: 200x60px. Max file size: 2MB
                  </p>
                </div>
              </div>
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <Switch
                  id="use-custom-footer"
                  checked={brandingSettings.useCustomFooter}
                  onCheckedChange={handleUseCustomFooter}
                />
                <Label htmlFor="use-custom-footer">Use Custom Footer Text</Label>
              </div>
              
              {brandingSettings.useCustomFooter && (
                <div className="mt-2">
                  <Label htmlFor="footer-text">Custom Footer Text</Label>
                  <Input
                    id="footer-text"
                    value={brandingSettings.customFooterText}
                    onChange={handleFooterTextChange}
                    placeholder="Enter custom footer text"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Leave empty to use default footer text
                  </p>
                </div>
              )}
            </div>
            
            <div className="mt-4 border-t pt-4">
              <h3 className="text-lg font-medium mb-2">Preview</h3>
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  {logoPreview ? (
                    <img 
                      src={logoPreview} 
                      alt="Logo Preview" 
                      className="h-6 object-contain" 
                    />
                  ) : (
                    <div className="flex items-center">
                      <div className="h-2 w-2 rounded-full bg-avianet-red mr-2"></div>
                      <span className="font-bold">AVIANET Vision</span>
                    </div>
                  )}
                </div>
                
                <div className="p-2 border rounded text-sm text-center text-muted-foreground">
                  {brandingSettings.useCustomFooter && brandingSettings.customFooterText ? 
                    brandingSettings.customFooterText :
                    `© Copyright ${currentYear} AVIANET | All Rights Reserved`
                  }
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
      
      <Card className="w-full">
        <CardHeader className="border-b">
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center">
              <Layers className="mr-2 text-avianet-red" size={20} />
              AI Models Configuration 
            </div>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center text-xs bg-gray-100 px-3 py-1 rounded">
                    <Info className="mr-1 h-3 w-3" />
                    Mode: {storageMode === 'api' ? 'Edge Computing Node' : 'Browser Simulation'}
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <div className="w-64 p-2 space-y-2">
                    <p className="text-sm">Current storage mode for AI models</p>
                    <div className="flex space-x-2">
                      <Button size="sm" variant={storageMode === 'api' ? "default" : "outline"} 
                              onClick={() => handleStorageModeChange('api')}>
                        Edge Computing
                      </Button>
                      <Button size="sm" variant={storageMode === 'simulated' ? "default" : "outline"}
                              onClick={() => handleStorageModeChange('simulated')}>
                        Simulation
                      </Button>
                    </div>
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
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
            AI Model Parameters
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6">
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
          <Tabs defaultValue="video">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="video">Video Settings</TabsTrigger>
              <TabsTrigger value="alerts">Alert Settings</TabsTrigger>
            </TabsList>
            
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
            
            <div className="flex items-center space-x-2 pt-4 border-t">
              <Switch
                id="use-server-ffmpeg"
                checked={ffmpegSettings.useServerBinary}
                onCheckedChange={(checked) => setFfmpegSettings({...ffmpegSettings, useServerBinary: checked})}
              />
              <Label htmlFor="use-server-ffmpeg">Use server-side FFmpeg for video processing</Label>
            </div>
            
            {ffmpegSettings.useServerBinary && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="ffmpeg-server-path">Server FFmpeg Binary Path</Label>
                  <Input
                    id="ffmpeg-server-path"
                    value={ffmpegSettings.serverBinaryPath || '/usr/bin/ffmpeg'}
                    onChange={(e) => setFfmpegSettings({...ffmpegSettings, serverBinaryPath: e.target.value})}
                    placeholder="Enter path to server FFmpeg binary (e.g. /usr/bin/ffmpeg)"
                  />
                </div>
                
                <div className="flex items-center space-x-2">
                  <Switch
                    id="server-transcoding"
                    checked={ffmpegSettings.serverTranscoding}
                    onCheckedChange={(checked) => setFfmpegSettings({...ffmpegSettings, serverTranscoding: checked})}
                  />
                  <Label htmlFor="server-transcoding">Enable server-side video transcoding</Label>
                </div>
                
                {ffmpegSettings.serverTranscoding && (
                  <div className="space-y-2">
                    <Label htmlFor="transcode-format">Transcoding Format</Label>
                    <Select 
                      value={ffmpegSettings.transcodeFormat} 
                      onValueChange={(value: 'hls' | 'mp4' | 'webm') => 
                        setFfmpegSettings({...ffmpegSettings, transcodeFormat: value})
                      }
                    >
                      <SelectTrigger id="transcode-format" className="w-full">
                        <SelectValue placeholder="Select format" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="hls">HLS (HTTP Live Streaming)</SelectItem>
                        <SelectItem value="mp4">MP4 (Better Compatibility)</SelectItem>
                        <SelectItem value="webm">WebM (Efficient Web Format)</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      HLS is recommended for live streams, MP4 for better compatibility, WebM for efficient streaming
                    </p>
                  </div>
                )}
              </>
            )}
            
            {!ffmpegSettings.useLocalBinary && !ffmpegSettings.useServerBinary && (
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
                <strong>Note:</strong> Using server-side FFmpeg requires proper backend configuration and permissions.
                Server-side transcoding can significantly improve playback compatibility and reduce client-side processing.
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
              <h3 className="text-lg font-medium">AVIANET Vision</h3>
              <p className="text-sm text-muted-foreground">
                AVIANET develops AI-driven solutions to support worker safety and health compliance using Vision AI. Our technology helps organizations monitor safety practices in real time, with a focus on sectors such as energy and industrial operations.
              </p>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <h4 className="text-sm font-medium">Version</h4>
                <p className="text-sm text-muted-foreground">1.0.0</p>
              </div>
              <div>
                <h4 className="text-sm font-medium">Model</h4>
                <p className="text-sm text-muted-foreground">AVIANET Vision AI Model</p>
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
