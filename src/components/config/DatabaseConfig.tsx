
import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';
import databaseService, { DatabaseConfig } from '@/services/DatabaseService';
import { Loader2, Check, X } from 'lucide-react';

const DatabaseConfigComponent = () => {
  const [config, setConfig] = useState<DatabaseConfig>({
    host: 'localhost',
    port: 5432,
    database: 'avianet',
    user: 'postgres',
    password: 'postgres',
    ssl: false
  });
  
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'failed'>('idle');
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    // Load current config
    const currentConfig = databaseService.getConfig();
    setConfig(currentConfig);
    
    // Test connection on component mount
    handleTestConnection();
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type } = e.target;
    
    setConfig(prev => ({
      ...prev,
      [name]: type === 'number' ? parseInt(value, 10) : value
    }));
  };

  const handleSslToggle = (checked: boolean) => {
    setConfig(prev => ({
      ...prev,
      ssl: checked
    }));
  };

  const handleTestConnection = async () => {
    setTestStatus('testing');
    
    try {
      await databaseService.testConnection();
      setTestStatus('success');
      toast.success('Database connection successful');
    } catch (error) {
      setTestStatus('failed');
      toast.error('Database connection failed');
      console.error('Connection test failed:', error);
    }
  };

  const handleSaveConfig = async () => {
    setIsSaving(true);
    
    try {
      const success = await databaseService.updateConfig(config);
      
      if (success) {
        toast.success('Database configuration saved successfully');
        setIsEditing(false);
        setTestStatus('success');
      } else {
        toast.error('Failed to save database configuration');
        setTestStatus('failed');
      }
    } catch (error) {
      console.error('Error saving database config:', error);
      toast.error('Error saving database configuration');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {testStatus === 'testing' && (
            <Loader2 className="h-4 w-4 animate-spin text-gray-500" />
          )}
          {testStatus === 'success' && (
            <Check className="h-4 w-4 text-green-500" />
          )}
          {testStatus === 'failed' && (
            <X className="h-4 w-4 text-red-500" />
          )}
          <span className={`text-sm ${
            testStatus === 'success' ? 'text-green-600' : 
            testStatus === 'failed' ? 'text-red-600' : 'text-gray-600'
          }`}>
            {testStatus === 'testing' ? 'Testing connection...' : 
             testStatus === 'success' ? 'Connection successful' : 
             testStatus === 'failed' ? 'Connection failed' : 'Connection status unknown'}
          </span>
        </div>
        
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleTestConnection}
            disabled={testStatus === 'testing'}
          >
            {testStatus === 'testing' ? 'Testing...' : 'Test Connection'}
          </Button>
          
          {!isEditing ? (
            <Button 
              size="sm" 
              onClick={() => setIsEditing(true)}
            >
              Edit Configuration
            </Button>
          ) : (
            <Button 
              size="sm" 
              variant="default" 
              onClick={handleSaveConfig}
              disabled={isSaving}
            >
              {isSaving ? 'Saving...' : 'Save Configuration'}
            </Button>
          )}
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="db-host">Host</Label>
          <Input
            id="db-host"
            name="host"
            value={config.host}
            onChange={handleInputChange}
            disabled={!isEditing}
            placeholder="localhost"
          />
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="db-port">Port</Label>
          <Input
            id="db-port"
            name="port"
            type="number"
            value={config.port}
            onChange={handleInputChange}
            disabled={!isEditing}
            placeholder="5432"
          />
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="db-name">Database Name</Label>
          <Input
            id="db-name"
            name="database"
            value={config.database}
            onChange={handleInputChange}
            disabled={!isEditing}
            placeholder="avianet"
          />
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="db-user">Username</Label>
          <Input
            id="db-user"
            name="user"
            value={config.user}
            onChange={handleInputChange}
            disabled={!isEditing}
            placeholder="postgres"
          />
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="db-password">Password</Label>
          <Input
            id="db-password"
            name="password"
            type="password"
            value={config.password}
            onChange={handleInputChange}
            disabled={!isEditing}
            placeholder="••••••••"
          />
        </div>
        
        <div className="flex items-center space-x-2 h-full pt-8">
          <Switch
            id="db-ssl"
            checked={config.ssl}
            onCheckedChange={handleSslToggle}
            disabled={!isEditing}
          />
          <Label htmlFor="db-ssl">Use SSL Connection</Label>
        </div>
      </div>
      
      <Card className="mt-4">
        <CardContent className="p-4 text-sm">
          <p className="text-muted-foreground">
            <strong>Important:</strong> Changes to database configuration may affect the application's 
            functionality. If connection fails, check that PostgreSQL is running and accessible from this host.
          </p>
          <p className="mt-2 text-muted-foreground">
            Default port for PostgreSQL is 5432. Make sure the database user has sufficient privileges.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default DatabaseConfigComponent;
