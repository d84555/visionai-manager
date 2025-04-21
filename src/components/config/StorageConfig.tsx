
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle, DrawerTrigger } from '@/components/ui/drawer';

interface StorageOption {
  type: 'local' | 'nas' | 'network';
  enabled: boolean;
  path: string;
  username?: string;
  password?: string;
  retentionDays: number;
  fileFormat: 'jpg' | 'png' | 'mp4' | 'avi';
  saveSnapshots: boolean;
  saveVideos: boolean;
  saveLogs: boolean;
}

const StorageConfig = () => {
  const [storageOptions, setStorageOptions] = useState<Record<'local' | 'nas' | 'network', StorageOption>>({
    local: {
      type: 'local',
      enabled: true,
      path: '/storage/local',
      retentionDays: 30,
      fileFormat: 'jpg',
      saveSnapshots: true,
      saveVideos: true,
      saveLogs: true
    },
    nas: {
      type: 'nas',
      enabled: false,
      path: '//nas/share',
      username: '',
      password: '',
      retentionDays: 90,
      fileFormat: 'jpg',
      saveSnapshots: true,
      saveVideos: true,
      saveLogs: true
    },
    network: {
      type: 'network',
      enabled: false,
      path: '',
      username: '',
      password: '',
      retentionDays: 60,
      fileFormat: 'jpg',
      saveSnapshots: true,
      saveVideos: true,
      saveLogs: false
    }
  });
  
  const [testStatus, setTestStatus] = useState<Record<'local' | 'nas' | 'network', 'idle' | 'testing' | 'success' | 'failed'>>({
    local: 'idle',
    nas: 'idle',
    network: 'idle'
  });
  
  const [activeStorage, setActiveStorage] = useState<'local' | 'nas' | 'network' | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const handleInputChange = (storage: 'local' | 'nas' | 'network', field: keyof StorageOption, value: string | boolean | number) => {
    setStorageOptions(prev => ({
      ...prev,
      [storage]: {
        ...prev[storage],
        [field]: value
      }
    }));
  };

  const handleToggleStorage = (storage: 'local' | 'nas' | 'network', enabled: boolean) => {
    setStorageOptions(prev => ({
      ...prev,
      [storage]: {
        ...prev[storage],
        enabled
      }
    }));
  };

  const handleTestStorage = (storage: 'local' | 'nas' | 'network') => {
    const option = storageOptions[storage];
    
    if (!option.path) {
      toast.error('Please enter a storage path');
      return;
    }

    setTestStatus(prev => ({ ...prev, [storage]: 'testing' }));
    
    // Simulate testing the storage connection
    setTimeout(() => {
      if (option.path) {
        setTestStatus(prev => ({ ...prev, [storage]: 'success' }));
        toast.success(`${storage === 'local' ? 'Local storage' : storage === 'nas' ? 'NAS storage' : 'Network storage'} tested successfully`);
      } else {
        setTestStatus(prev => ({ ...prev, [storage]: 'failed' }));
        toast.error(`Failed to access ${storage} storage`);
      }
      
      setTimeout(() => {
        setTestStatus(prev => ({ ...prev, [storage]: 'idle' }));
      }, 3000);
    }, 1500);
  };
  
  const openStorageDrawer = (storage: 'local' | 'nas' | 'network') => {
    setActiveStorage(storage);
    setDrawerOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="flex items-center justify-between p-3 border rounded-lg">
          <div>
            <h3 className="text-base font-medium">Local Storage</h3>
            <p className="text-sm text-muted-foreground">Store events on the local system</p>
          </div>
          
          <div className="flex items-center space-x-2">
            <Switch
              id="enable-local"
              checked={storageOptions.local.enabled}
              onCheckedChange={(checked) => handleToggleStorage('local', checked)}
            />
            
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => openStorageDrawer('local')}
            >
              Configure
            </Button>
            
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => handleTestStorage('local')}
              disabled={!storageOptions.local.enabled || testStatus.local === 'testing'}
            >
              {testStatus.local === 'testing' ? 'Testing...' : 'Test'}
            </Button>
          </div>
        </div>
        
        <div className="flex items-center justify-between p-3 border rounded-lg">
          <div>
            <h3 className="text-base font-medium">NAS Storage</h3>
            <p className="text-sm text-muted-foreground">Store events on a network attached storage device</p>
          </div>
          
          <div className="flex items-center space-x-2">
            <Switch
              id="enable-nas"
              checked={storageOptions.nas.enabled}
              onCheckedChange={(checked) => handleToggleStorage('nas', checked)}
            />
            
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => openStorageDrawer('nas')}
            >
              Configure
            </Button>
            
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => handleTestStorage('nas')}
              disabled={!storageOptions.nas.enabled || testStatus.nas === 'testing'}
            >
              {testStatus.nas === 'testing' ? 'Testing...' : 'Test'}
            </Button>
          </div>
        </div>
        
        <div className="flex items-center justify-between p-3 border rounded-lg">
          <div>
            <h3 className="text-base font-medium">Network Storage</h3>
            <p className="text-sm text-muted-foreground">Store events on a network path (SMB/NFS)</p>
          </div>
          
          <div className="flex items-center space-x-2">
            <Switch
              id="enable-network"
              checked={storageOptions.network.enabled}
              onCheckedChange={(checked) => handleToggleStorage('network', checked)}
            />
            
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => openStorageDrawer('network')}
            >
              Configure
            </Button>
            
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => handleTestStorage('network')}
              disabled={!storageOptions.network.enabled || testStatus.network === 'testing'}
            >
              {testStatus.network === 'testing' ? 'Testing...' : 'Test'}
            </Button>
          </div>
        </div>
      </div>
      
      <Drawer open={drawerOpen && activeStorage !== null} onOpenChange={setDrawerOpen}>
        <DrawerContent>
          <div className="mx-auto w-full max-w-lg">
            <DrawerHeader>
              <DrawerTitle>
                {activeStorage === 'local' ? 'Local Storage Configuration' : 
                activeStorage === 'nas' ? 'NAS Storage Configuration' : 
                'Network Storage Configuration'}
              </DrawerTitle>
              <DrawerDescription>
                Configure storage settings for violation events
              </DrawerDescription>
            </DrawerHeader>
            
            {activeStorage && (
              <div className="p-4 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor={`${activeStorage}-path`}>Storage Path</Label>
                  <Input
                    id={`${activeStorage}-path`}
                    value={storageOptions[activeStorage].path}
                    onChange={(e) => handleInputChange(activeStorage, 'path', e.target.value)}
                    placeholder={activeStorage === 'local' ? '/storage/events' : 
                                activeStorage === 'nas' ? '//nas/share' : 
                                'smb://server/share or nfs://server/export'}
                  />
                  <p className="text-xs text-muted-foreground">
                    {activeStorage === 'local' ? 'Local directory path' : 
                     activeStorage === 'nas' ? 'NAS share path' : 
                     'Network path using SMB or NFS protocol'}
                  </p>
                </div>
                
                {(activeStorage === 'nas' || activeStorage === 'network') && (
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor={`${activeStorage}-username`}>Username</Label>
                      <Input
                        id={`${activeStorage}-username`}
                        value={storageOptions[activeStorage].username || ''}
                        onChange={(e) => handleInputChange(activeStorage, 'username', e.target.value)}
                        placeholder="Username for authentication"
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor={`${activeStorage}-password`}>Password</Label>
                      <Input
                        id={`${activeStorage}-password`}
                        type="password"
                        value={storageOptions[activeStorage].password || ''}
                        onChange={(e) => handleInputChange(activeStorage, 'password', e.target.value)}
                        placeholder="Password for authentication"
                      />
                    </div>
                  </div>
                )}
                
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor={`${activeStorage}-retention`}>Retention Period (days)</Label>
                    <Input
                      id={`${activeStorage}-retention`}
                      type="number"
                      min="1"
                      max="365"
                      value={storageOptions[activeStorage].retentionDays.toString()}
                      onChange={(e) => handleInputChange(activeStorage, 'retentionDays', parseInt(e.target.value) || 30)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Events older than this will be automatically deleted
                    </p>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor={`${activeStorage}-format`}>File Format</Label>
                    <Select
                      value={storageOptions[activeStorage].fileFormat}
                      onValueChange={(value: 'jpg' | 'png' | 'mp4' | 'avi') => handleInputChange(activeStorage, 'fileFormat', value)}
                    >
                      <SelectTrigger id={`${activeStorage}-format`}>
                        <SelectValue placeholder="Select Format" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="jpg">JPG (images)</SelectItem>
                        <SelectItem value="png">PNG (images)</SelectItem>
                        <SelectItem value="mp4">MP4 (videos)</SelectItem>
                        <SelectItem value="avi">AVI (videos)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                <div className="space-y-3 pt-2">
                  <div className="flex items-center space-x-2">
                    <Switch
                      id={`${activeStorage}-snapshots`}
                      checked={storageOptions[activeStorage].saveSnapshots}
                      onCheckedChange={(checked) => handleInputChange(activeStorage, 'saveSnapshots', checked)}
                    />
                    <Label htmlFor={`${activeStorage}-snapshots`}>Save Detection Snapshots</Label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Switch
                      id={`${activeStorage}-videos`}
                      checked={storageOptions[activeStorage].saveVideos}
                      onCheckedChange={(checked) => handleInputChange(activeStorage, 'saveVideos', checked)}
                    />
                    <Label htmlFor={`${activeStorage}-videos`}>Save Video Clips</Label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Switch
                      id={`${activeStorage}-logs`}
                      checked={storageOptions[activeStorage].saveLogs}
                      onCheckedChange={(checked) => handleInputChange(activeStorage, 'saveLogs', checked)}
                    />
                    <Label htmlFor={`${activeStorage}-logs`}>Save Event Logs</Label>
                  </div>
                </div>
                
                <div className="flex justify-end space-x-2 pt-4">
                  <Button variant="outline" onClick={() => setDrawerOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={() => setDrawerOpen(false)}>
                    Save Configuration
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DrawerContent>
      </Drawer>
      
      <div className="p-2 bg-yellow-50 border border-yellow-200 rounded-md">
        <p className="text-sm text-yellow-700">
          <strong>Note:</strong> Make sure that the paths are accessible and writable by the application.
          Network storage may require proper authentication and network connectivity.
        </p>
      </div>
    </div>
  );
};

export default StorageConfig;
