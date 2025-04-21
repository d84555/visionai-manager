
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from 'sonner';

type SMTPProvider = 'custom' | 'ses' | 'sendgrid';

interface SMTPConfig {
  type: SMTPProvider;
  enabled: boolean;
  fromEmail: string;
  server: string;
  port: string;
  username: string;
  password: string;
  useTLS: boolean;
  apiKey?: string;
  region?: string;
}

const SmtpConfig = () => {
  const [activeProvider, setActiveProvider] = useState<SMTPProvider>('custom');
  const [testEmail, setTestEmail] = useState('');
  const [testDialogOpen, setTestDialogOpen] = useState(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'failed'>('idle');
  
  const [smtpConfigs, setSmtpConfigs] = useState<Record<SMTPProvider, SMTPConfig>>({
    custom: {
      type: 'custom',
      enabled: false,
      fromEmail: '',
      server: '',
      port: '587',
      username: '',
      password: '',
      useTLS: true
    },
    ses: {
      type: 'ses',
      enabled: false,
      fromEmail: '',
      server: 'email-smtp.us-east-1.amazonaws.com',
      port: '587',
      username: '',
      password: '',
      useTLS: true,
      region: 'us-east-1'
    },
    sendgrid: {
      type: 'sendgrid',
      enabled: false,
      fromEmail: '',
      server: 'smtp.sendgrid.net',
      port: '587',
      username: 'apikey',
      password: '',
      useTLS: true,
      apiKey: ''
    }
  });

  const handleInputChange = (provider: SMTPProvider, field: keyof SMTPConfig, value: string | boolean) => {
    setSmtpConfigs(prev => ({
      ...prev,
      [provider]: {
        ...prev[provider],
        [field]: value
      }
    }));
  };

  const handleTestEmail = () => {
    if (!testEmail) {
      toast.error('Please enter a test email address');
      return;
    }

    setTestStatus('testing');
    
    // Simulate sending a test email
    setTimeout(() => {
      const config = smtpConfigs[activeProvider];
      
      if (config.enabled && 
          ((config.type === 'custom' && config.server && config.port) || 
           (config.type === 'ses' && config.username && config.password) ||
           (config.type === 'sendgrid' && config.apiKey))) {
        setTestStatus('success');
        toast.success(`Test email sent to ${testEmail}`);
      } else {
        setTestStatus('failed');
        toast.error('Failed to send test email. Check your configuration.');
      }
      
      setTestDialogOpen(false);
      setTimeout(() => setTestStatus('idle'), 3000);
    }, 2000);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Tabs 
          defaultValue="custom" 
          className="w-full"
          onValueChange={(value) => setActiveProvider(value as SMTPProvider)}
        >
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="custom">Custom SMTP</TabsTrigger>
            <TabsTrigger value="ses">Amazon SES</TabsTrigger>
            <TabsTrigger value="sendgrid">SendGrid</TabsTrigger>
          </TabsList>
          
          <div className="flex items-center justify-between pt-4">
            <div className="flex items-center space-x-2">
              <Switch
                id={`enable-${activeProvider}`}
                checked={smtpConfigs[activeProvider].enabled}
                onCheckedChange={(checked) => handleInputChange(activeProvider, 'enabled', checked)}
              />
              <Label htmlFor={`enable-${activeProvider}`}>
                {activeProvider === 'custom' ? 'Enable Custom SMTP' : 
                 activeProvider === 'ses' ? 'Enable Amazon SES' : 'Enable SendGrid'}
              </Label>
            </div>
            
            <Dialog open={testDialogOpen} onOpenChange={setTestDialogOpen}>
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!smtpConfigs[activeProvider].enabled || testStatus === 'testing'}
                >
                  {testStatus === 'testing' ? 'Sending...' : 'Test Email'}
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                  <DialogTitle>Send Test Email</DialogTitle>
                  <DialogDescription>
                    Enter an email address to send a test message using the current configuration.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="test-email">Email Address</Label>
                    <Input
                      id="test-email"
                      value={testEmail}
                      onChange={(e) => setTestEmail(e.target.value)}
                      placeholder="example@example.com"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={handleTestEmail} disabled={testStatus === 'testing'}>
                    {testStatus === 'testing' ? 'Sending...' : 'Send Test Email'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
          
          <TabsContent value="custom" className="space-y-4 pt-4">
            {smtpConfigs.custom.enabled && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="custom-from-email">From Email Address</Label>
                  <Input
                    id="custom-from-email"
                    value={smtpConfigs.custom.fromEmail}
                    onChange={(e) => handleInputChange('custom', 'fromEmail', e.target.value)}
                    placeholder="alerts@yourdomain.com"
                  />
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="custom-server">SMTP Server</Label>
                    <Input
                      id="custom-server"
                      value={smtpConfigs.custom.server}
                      onChange={(e) => handleInputChange('custom', 'server', e.target.value)}
                      placeholder="smtp.yourdomain.com"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="custom-port">Port</Label>
                    <Input
                      id="custom-port"
                      value={smtpConfigs.custom.port}
                      onChange={(e) => handleInputChange('custom', 'port', e.target.value)}
                      placeholder="587"
                    />
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="custom-username">Username</Label>
                    <Input
                      id="custom-username"
                      value={smtpConfigs.custom.username}
                      onChange={(e) => handleInputChange('custom', 'username', e.target.value)}
                      placeholder="SMTP username"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="custom-password">Password</Label>
                    <Input
                      id="custom-password"
                      type="password"
                      value={smtpConfigs.custom.password}
                      onChange={(e) => handleInputChange('custom', 'password', e.target.value)}
                      placeholder="SMTP password"
                    />
                  </div>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Switch
                    id="custom-tls"
                    checked={smtpConfigs.custom.useTLS}
                    onCheckedChange={(checked) => handleInputChange('custom', 'useTLS', checked)}
                  />
                  <Label htmlFor="custom-tls">Use TLS/SSL</Label>
                </div>
              </>
            )}
          </TabsContent>
          
          <TabsContent value="ses" className="space-y-4 pt-4">
            {smtpConfigs.ses.enabled && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="ses-from-email">From Email Address (Verified in SES)</Label>
                  <Input
                    id="ses-from-email"
                    value={smtpConfigs.ses.fromEmail}
                    onChange={(e) => handleInputChange('ses', 'fromEmail', e.target.value)}
                    placeholder="alerts@yourdomain.com"
                  />
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="ses-region">AWS Region</Label>
                    <Select
                      value={smtpConfigs.ses.region}
                      onValueChange={(value) => handleInputChange('ses', 'region', value)}
                    >
                      <SelectTrigger id="ses-region">
                        <SelectValue placeholder="Select Region" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="us-east-1">US East (N. Virginia)</SelectItem>
                        <SelectItem value="us-east-2">US East (Ohio)</SelectItem>
                        <SelectItem value="us-west-1">US West (N. California)</SelectItem>
                        <SelectItem value="us-west-2">US West (Oregon)</SelectItem>
                        <SelectItem value="eu-west-1">EU (Ireland)</SelectItem>
                        <SelectItem value="eu-central-1">EU (Frankfurt)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="ses-username">SMTP Username</Label>
                    <Input
                      id="ses-username"
                      value={smtpConfigs.ses.username}
                      onChange={(e) => handleInputChange('ses', 'username', e.target.value)}
                      placeholder="SES SMTP username"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="ses-password">SMTP Password</Label>
                    <Input
                      id="ses-password"
                      type="password"
                      value={smtpConfigs.ses.password}
                      onChange={(e) => handleInputChange('ses', 'password', e.target.value)}
                      placeholder="SES SMTP password"
                    />
                  </div>
                </div>
                
                <p className="text-xs text-muted-foreground">
                  SMTP credentials are different from AWS API credentials. You can find your SMTP credentials in the AWS SES console.
                </p>
              </>
            )}
          </TabsContent>
          
          <TabsContent value="sendgrid" className="space-y-4 pt-4">
            {smtpConfigs.sendgrid.enabled && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="sendgrid-from-email">From Email Address (Verified in SendGrid)</Label>
                  <Input
                    id="sendgrid-from-email"
                    value={smtpConfigs.sendgrid.fromEmail}
                    onChange={(e) => handleInputChange('sendgrid', 'fromEmail', e.target.value)}
                    placeholder="alerts@yourdomain.com"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="sendgrid-api-key">API Key</Label>
                  <Input
                    id="sendgrid-api-key"
                    type="password"
                    value={smtpConfigs.sendgrid.apiKey || ''}
                    onChange={(e) => handleInputChange('sendgrid', 'apiKey', e.target.value)}
                    placeholder="SendGrid API key"
                  />
                </div>
                
                <p className="text-xs text-muted-foreground">
                  You need to create an API key with mail send permissions in your SendGrid account.
                  The system will automatically configure the username as "apikey" and password as your API key.
                </p>
              </>
            )}
          </TabsContent>
        </Tabs>
      </div>
      
      {testStatus === 'success' && (
        <div className="p-2 bg-green-50 border border-green-200 rounded-md text-sm text-green-600">
          Test email sent successfully
        </div>
      )}
      
      {testStatus === 'failed' && (
        <div className="p-2 bg-red-50 border border-red-200 rounded-md text-sm text-red-600">
          Failed to send test email. Please check your configuration.
        </div>
      )}
    </div>
  );
};

export default SmtpConfig;
