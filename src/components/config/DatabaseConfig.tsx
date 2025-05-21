
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Database, Check, RefreshCw, X } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import DatabaseService from '@/services/DatabaseService';
import MigrationService from '@/services/MigrationService';

const DatabaseConfig = () => {
  const [config, setConfig] = useState({
    host: 'localhost',
    port: 5432,
    database: 'avianet',
    user: 'postgres',
    password: '',
    ssl: false
  });
  
  const [isConnected, setIsConnected] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isMigrating, setIsMigrating] = useState(false);

  useEffect(() => {
    const dbConfig = DatabaseService.getConnectionConfig();
    setConfig(dbConfig);
    
    // Test connection on component mount
    testConnection();
  }, []);
  
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type } = e.target;
    
    if (type === 'number') {
      setConfig({
        ...config,
        [name]: parseInt(value, 10)
      });
    } else {
      setConfig({
        ...config,
        [name]: value
      });
    }
  };
  
  const handleSslToggle = (checked: boolean) => {
    setConfig({
      ...config,
      ssl: checked
    });
  };
  
  const saveConfig = async () => {
    setIsLoading(true);
    try {
      DatabaseService.saveConnectionConfig(config);
      toast.success('Database configuration saved');
      await testConnection();
    } catch (error) {
      console.error('Error saving database config:', error);
      toast.error('Failed to save database configuration');
    } finally {
      setIsLoading(false);
    }
  };
  
  const testConnection = async () => {
    setIsTesting(true);
    try {
      const result = await DatabaseService.testConnection();
      setIsConnected(true);
      toast.success('Successfully connected to database');
      return true;
    } catch (error) {
      console.error('Database connection failed:', error);
      setIsConnected(false);
      toast.error('Failed to connect to database');
      return false;
    } finally {
      setIsTesting(false);
    }
  };

  const migrateData = async () => {
    setIsMigrating(true);
    try {
      const success = await MigrationService.migrateSettings();
      if (success) {
        toast.success('Successfully migrated settings to database');
      }
    } catch (error) {
      console.error('Migration failed:', error);
      toast.error('Failed to migrate settings to database');
    } finally {
      setIsMigrating(false);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader className="border-b">
        <CardTitle className="flex items-center">
          <Database className="mr-2 text-avianet-red" size={20} />
          Database Configuration
        </CardTitle>
      </CardHeader>
      <CardContent className="p-6">
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="host">Host</Label>
              <Input
                id="host"
                name="host"
                value={config.host}
                onChange={handleInputChange}
                placeholder="Database host (e.g., localhost)"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="port">Port</Label>
              <Input
                id="port"
                name="port"
                type="number"
                min={1}
                max={65535}
                value={config.port}
                onChange={handleInputChange}
                placeholder="Database port (e.g., 5432)"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="database">Database Name</Label>
              <Input
                id="database"
                name="database"
                value={config.database}
                onChange={handleInputChange}
                placeholder="Database name"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="user">Username</Label>
              <Input
                id="user"
                name="user"
                value={config.user}
                onChange={handleInputChange}
                placeholder="Database username"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                value={config.password}
                onChange={handleInputChange}
                placeholder="Database password"
              />
            </div>
            
            <div className="flex items-center space-x-2 self-end">
              <Switch
                id="ssl"
                checked={config.ssl}
                onCheckedChange={handleSslToggle}
              />
              <Label htmlFor="ssl">Enable SSL</Label>
            </div>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between pt-4 border-t">
            <div className="flex items-center gap-2">
              {isConnected === null ? (
                <Skeleton className="h-6 w-24" />
              ) : isConnected ? (
                <div className="flex items-center text-green-600">
                  <Check className="mr-1" size={16} />
                  <span>Connected</span>
                </div>
              ) : (
                <div className="flex items-center text-red-600">
                  <X className="mr-1" size={16} />
                  <span>Not Connected</span>
                </div>
              )}
            </div>
            
            <div className="flex flex-col sm:flex-row gap-2">
              <Button 
                variant="outline" 
                onClick={testConnection}
                disabled={isTesting || isLoading}
              >
                {isTesting ? (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    Testing...
                  </>
                ) : (
                  <>Test Connection</>
                )}
              </Button>
              
              <Button 
                onClick={saveConfig}
                disabled={isLoading}
              >
                {isLoading ? "Saving..." : "Save Configuration"}
              </Button>
            </div>
          </div>
          
          {isConnected && (
            <div className="pt-4 border-t">
              <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-md p-4 mb-4">
                <h3 className="text-sm font-medium text-amber-800 dark:text-amber-300">Data Migration</h3>
                <p className="text-sm text-amber-700 dark:text-amber-400 mt-1">
                  Migrate your settings from browser local storage to the PostgreSQL database. 
                  This is a one-time operation and will copy all your current settings.
                </p>
              </div>
              
              <Button
                onClick={migrateData}
                disabled={isMigrating || !isConnected}
                className="w-full sm:w-auto"
              >
                {isMigrating ? (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    Migrating Settings...
                  </>
                ) : (
                  <>Migrate Settings to Database</>
                )}
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default DatabaseConfig;
