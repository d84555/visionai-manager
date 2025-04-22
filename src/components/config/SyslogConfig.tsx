
import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import SettingsService, { SyslogSettings } from '@/services/SettingsService';

const SyslogConfig = () => {
  const [syslogEnabled, setSyslogEnabled] = useState(false);
  const [syslogConfig, setSyslogConfig] = useState<SyslogSettings>({
    enabled: false,
    server: '',
    port: '514',
    protocol: 'udp',
    facility: 'local0',
    severity: 'notice',
  });
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'failed'>('idle');

  // Load settings from storage on component mount
  useEffect(() => {
    const savedSettings = SettingsService.getSettings('syslog');
    setSyslogEnabled(savedSettings.enabled);
    setSyslogConfig(savedSettings);
  }, []);

  // Save settings whenever they change
  useEffect(() => {
    SettingsService.updateSettings('syslog', {
      ...syslogConfig,
      enabled: syslogEnabled,
    });
  }, [syslogEnabled, syslogConfig]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setSyslogConfig(prev => ({ ...prev, [name]: value }));
  };

  const handleSelectChange = (name: string, value: string) => {
    setSyslogConfig(prev => ({ ...prev, [name]: value }));
  };

  const handleTestConnection = () => {
    if (!syslogConfig.server) {
      toast.error('Please enter a server address');
      return;
    }

    setTestStatus('testing');
    
    // Simulate testing the Syslog connection
    setTimeout(() => {
      if (syslogConfig.server && syslogConfig.port) {
        setTestStatus('success');
        toast.success('Syslog connection tested successfully');
      } else {
        setTestStatus('failed');
        toast.error('Syslog connection test failed');
      }
    }, 1500);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Switch
            id="enable-syslog"
            checked={syslogEnabled}
            onCheckedChange={(checked) => {
              setSyslogEnabled(checked);
              setSyslogConfig(prev => ({ ...prev, enabled: checked }));
            }}
          />
          <Label htmlFor="enable-syslog">Enable Syslog Integration</Label>
        </div>
        
        <Button 
          variant="outline" 
          size="sm" 
          onClick={handleTestConnection}
          disabled={!syslogEnabled || testStatus === 'testing' || !syslogConfig.server}
        >
          {testStatus === 'testing' ? 'Testing...' : 'Test Connection'}
        </Button>
      </div>
      
      {syslogEnabled && (
        <div className="space-y-4 pt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="syslog-server">Syslog Server Address</Label>
              <Input
                id="syslog-server"
                name="server"
                value={syslogConfig.server}
                onChange={handleInputChange}
                placeholder="e.g., 192.168.1.100 or syslog.example.com"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="syslog-port">Port</Label>
              <Input
                id="syslog-port"
                name="port"
                value={syslogConfig.port}
                onChange={handleInputChange}
                placeholder="514"
              />
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="syslog-protocol">Protocol</Label>
              <Select
                value={syslogConfig.protocol}
                onValueChange={(value) => handleSelectChange('protocol', value)}
              >
                <SelectTrigger id="syslog-protocol">
                  <SelectValue placeholder="Select Protocol" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="udp">UDP</SelectItem>
                  <SelectItem value="tcp">TCP</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="syslog-facility">Facility</Label>
              <Select
                value={syslogConfig.facility}
                onValueChange={(value) => handleSelectChange('facility', value)}
              >
                <SelectTrigger id="syslog-facility">
                  <SelectValue placeholder="Select Facility" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="kern">Kernel</SelectItem>
                  <SelectItem value="user">User</SelectItem>
                  <SelectItem value="mail">Mail</SelectItem>
                  <SelectItem value="daemon">System Daemons</SelectItem>
                  <SelectItem value="auth">Security/Auth</SelectItem>
                  <SelectItem value="syslog">Syslog Internal</SelectItem>
                  <SelectItem value="local0">Local 0</SelectItem>
                  <SelectItem value="local1">Local 1</SelectItem>
                  <SelectItem value="local2">Local 2</SelectItem>
                  <SelectItem value="local3">Local 3</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="syslog-severity">Severity</Label>
              <Select
                value={syslogConfig.severity}
                onValueChange={(value) => handleSelectChange('severity', value)}
              >
                <SelectTrigger id="syslog-severity">
                  <SelectValue placeholder="Select Severity" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="emerg">Emergency</SelectItem>
                  <SelectItem value="alert">Alert</SelectItem>
                  <SelectItem value="crit">Critical</SelectItem>
                  <SelectItem value="err">Error</SelectItem>
                  <SelectItem value="warning">Warning</SelectItem>
                  <SelectItem value="notice">Notice</SelectItem>
                  <SelectItem value="info">Info</SelectItem>
                  <SelectItem value="debug">Debug</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div className="pt-2">
            <p className="text-sm text-muted-foreground">
              All system alerts and violation events will be pushed to the configured Syslog server.
              Make sure the server is accessible from this network.
            </p>
          </div>
          
          {testStatus === 'success' && (
            <div className="p-2 bg-green-50 border border-green-200 rounded-md text-sm text-green-600">
              Connection to Syslog server successful
            </div>
          )}
          
          {testStatus === 'failed' && (
            <div className="p-2 bg-red-50 border border-red-200 rounded-md text-sm text-red-600">
              Failed to connect to Syslog server. Please check server address and port.
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SyslogConfig;
