
import React, { useState, useEffect } from 'react';
import { HardHat, Eye, HandMetal, Shirt, PersonStanding, Clock, MapPin, FireExtinguisher, Flame, AlarmSmoke, MapPinOff, MapPinX, Camera, CameraOff, Bug, User, LogIn, LogOut, FileText } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';

import SettingsService, { EventTypeConfig, EventsSettings } from '@/services/SettingsService';

const EventsConfig: React.FC = () => {
  const [eventsSettings, setEventsSettings] = useState<EventsSettings>(
    SettingsService.getSettings('events') as EventsSettings
  );
  const [activeTab, setActiveTab] = useState<string>('ppe');

  useEffect(() => {
    // Load event settings
    const settings = SettingsService.getSettings('events') as EventsSettings;
    setEventsSettings(settings);
  }, []);

  const handleEventToggle = (id: string, enabled: boolean) => {
    const updatedTypes = eventsSettings.types.map(eventType =>
      eventType.id === id ? { ...eventType, enabled } : eventType
    );
    
    const updatedSettings = {
      ...eventsSettings,
      types: updatedTypes,
    };
    
    setEventsSettings(updatedSettings);
    SettingsService.updateSettings('events', updatedSettings);
    
    toast.success(`${enabled ? 'Enabled' : 'Disabled'} event type: ${updatedTypes.find(e => e.id === id)?.name}`);
  };

  const handleNotificationToggle = (id: string, notifyOnTriggered: boolean) => {
    const updatedTypes = eventsSettings.types.map(eventType =>
      eventType.id === id ? { ...eventType, notifyOnTriggered } : eventType
    );
    
    const updatedSettings = {
      ...eventsSettings,
      types: updatedTypes,
    };
    
    setEventsSettings(updatedSettings);
    SettingsService.updateSettings('events', updatedSettings);
  };

  const handleRecordToggle = (id: string, recordVideo: boolean) => {
    const updatedTypes = eventsSettings.types.map(eventType =>
      eventType.id === id ? { ...eventType, recordVideo } : eventType
    );
    
    const updatedSettings = {
      ...eventsSettings,
      types: updatedTypes,
    };
    
    setEventsSettings(updatedSettings);
    SettingsService.updateSettings('events', updatedSettings);
  };

  const handleSeverityChange = (id: string, severity: 'low' | 'medium' | 'high' | 'critical') => {
    const updatedTypes = eventsSettings.types.map(eventType =>
      eventType.id === id ? { ...eventType, severity } : eventType
    );
    
    const updatedSettings = {
      ...eventsSettings,
      types: updatedTypes,
    };
    
    setEventsSettings(updatedSettings);
    SettingsService.updateSettings('events', updatedSettings);
  };

  const handleGlobalSettingChange = (setting: keyof EventsSettings, value: any) => {
    const updatedSettings = {
      ...eventsSettings,
      [setting]: value,
    };
    
    setEventsSettings(updatedSettings);
    SettingsService.updateSettings('events', updatedSettings);
    
    toast.success(`Updated ${setting} setting`);
  };

  const getEventIcon = (eventId: string) => {
    switch (eventId) {
      case 'helmet-not-detected':
        return <HardHat size={20} className="text-red-500" />;
      case 'coverall-not-detected':
        return <Shirt size={20} className="text-red-500" />;
      case 'gloves-not-detected':
        return <HandMetal size={20} className="text-red-500" />;
      case 'goggles-not-detected':
        return <Eye size={20} className="text-red-500" />;
      case 'all-ppe-detected':
        return <HardHat size={20} className="text-green-500" />;
      case 'unauthorized-zone-entry':
        return <MapPinX size={20} className="text-orange-500" />;
      case 'loitering-detection':
        return <Clock size={20} className="text-orange-500" />;
      case 'entry-outside-hours':
        return <PersonStanding size={20} className="text-red-500" />;
      case 'restricted-area-detection':
        return <MapPinOff size={20} className="text-red-500" />;
      case 'smoke-fire-detection':
        return <Flame size={20} className="text-red-500" />;
      case 'camera-offline':
        return <CameraOff size={20} className="text-gray-500" />;
      case 'model-inference-error':
        return <Bug size={20} className="text-orange-500" />;
      case 'user-login-logout':
        return <LogIn size={20} className="text-blue-500" />;
      case 'manual-event-tagging':
        return <FileText size={20} className="text-blue-500" />;
      case 'configuration-changes':
        return <FileText size={20} className="text-blue-500" />;
      default:
        return <FileText size={20} />;
    }
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'low':
        return <Badge variant="outline">Low</Badge>;
      case 'medium':
        return <Badge variant="secondary">Medium</Badge>;
      case 'high':
        return <Badge variant="destructive">High</Badge>;
      case 'critical':
        return <Badge className="bg-red-500 text-white hover:bg-red-600">Critical</Badge>;
      default:
        return <Badge variant="outline">{severity}</Badge>;
    }
  };

  const renderEventTypeTable = (category: 'ppe' | 'zone' | 'environment' | 'system') => {
    const filteredEvents = eventsSettings.types.filter(
      (eventType) => eventType.category === category
    );

    return (
      <div className="rounded-md border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[50px]"></TableHead>
              <TableHead>Event Type</TableHead>
              <TableHead>Severity</TableHead>
              <TableHead className="w-[120px]">Enabled</TableHead>
              <TableHead className="w-[120px]">Notify</TableHead>
              <TableHead className="w-[120px]">Record</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredEvents.length > 0 ? (
              filteredEvents.map((eventType) => (
                <TableRow key={eventType.id}>
                  <TableCell>
                    {getEventIcon(eventType.id)}
                  </TableCell>
                  <TableCell>
                    <div>
                      <p className="font-medium">{eventType.name}</p>
                      <p className="text-sm text-muted-foreground">{eventType.description}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Select
                      value={eventType.severity}
                      onValueChange={(value: 'low' | 'medium' | 'high' | 'critical') => 
                        handleSeverityChange(eventType.id, value)
                      }
                    >
                      <SelectTrigger className="w-[110px]">
                        <SelectValue>{getSeverityBadge(eventType.severity)}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="critical">Critical</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Switch 
                      checked={eventType.enabled} 
                      onCheckedChange={(checked) => handleEventToggle(eventType.id, checked)}
                    />
                  </TableCell>
                  <TableCell>
                    <Switch 
                      checked={eventType.notifyOnTriggered} 
                      onCheckedChange={(checked) => handleNotificationToggle(eventType.id, checked)}
                      disabled={!eventType.enabled}
                    />
                  </TableCell>
                  <TableCell>
                    <Switch 
                      checked={eventType.recordVideo} 
                      onCheckedChange={(checked) => handleRecordToggle(eventType.id, checked)}
                      disabled={!eventType.enabled}
                    />
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-6 text-muted-foreground">
                  No event types in this category
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    );
  };

  const getCategoryLabel = (category: string): string => {
    switch (category) {
      case 'ppe':
        return 'PPE Compliance';
      case 'zone':
        return 'Zone & Time-Based';
      case 'environment':
        return 'Environment';
      case 'system':
        return 'System & User';
      default:
        return category;
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'ppe':
        return <HardHat className="h-4 w-4" />;
      case 'zone':
        return <MapPin className="h-4 w-4" />;
      case 'environment':
        return <AlarmSmoke className="h-4 w-4" />;
      case 'system':
        return <Camera className="h-4 w-4" />;
      default:
        return null;
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Event Type Configuration</CardTitle>
        <CardDescription>
          Configure detection events, notifications, and recording settings
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <div className="space-y-1">
              <h3 className="text-lg font-medium">Global Settings</h3>
              <p className="text-sm text-muted-foreground">
                Configure global event handling settings
              </p>
            </div>
            <div className="flex flex-wrap gap-4">
              <div className="flex items-center space-x-2">
                <Switch 
                  id="notifications-enabled"
                  checked={eventsSettings.notificationsEnabled} 
                  onCheckedChange={(checked) => 
                    handleGlobalSettingChange('notificationsEnabled', checked)
                  }
                />
                <Label htmlFor="notifications-enabled">Enable All Notifications</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Switch 
                  id="record-events"
                  checked={eventsSettings.recordEvents} 
                  onCheckedChange={(checked) => 
                    handleGlobalSettingChange('recordEvents', checked)
                  }
                />
                <Label htmlFor="record-events">Enable All Recording</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Switch 
                  id="sound-alerts"
                  checked={eventsSettings.alertSoundEnabled} 
                  onCheckedChange={(checked) => 
                    handleGlobalSettingChange('alertSoundEnabled', checked)
                  }
                />
                <Label htmlFor="sound-alerts">Enable Alert Sounds</Label>
              </div>
            </div>
          </div>
          
          <div className="border-t pt-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium">Event Types</h3>
              <div className="flex items-center">
                <Label htmlFor="auto-delete-days" className="mr-2">Auto delete after</Label>
                <Input 
                  id="auto-delete-days"
                  type="number" 
                  className="w-20" 
                  value={eventsSettings.autoDeleteAfterDays}
                  onChange={(e) => 
                    handleGlobalSettingChange('autoDeleteAfterDays', parseInt(e.target.value) || 30)
                  }
                  min={1}
                  max={365}
                />
                <span className="ml-2">days</span>
              </div>
            </div>

            <Tabs 
              defaultValue="ppe" 
              onValueChange={setActiveTab}
              className="space-y-4"
            >
              <TabsList>
                <TabsTrigger value="ppe" className="flex items-center">
                  <HardHat className="mr-1 h-4 w-4" />
                  PPE Compliance
                </TabsTrigger>
                <TabsTrigger value="zone" className="flex items-center">
                  <MapPin className="mr-1 h-4 w-4" />
                  Zone & Time
                </TabsTrigger>
                <TabsTrigger value="environment" className="flex items-center">
                  <AlarmSmoke className="mr-1 h-4 w-4" />
                  Environment
                </TabsTrigger>
                <TabsTrigger value="system" className="flex items-center">
                  <Camera className="mr-1 h-4 w-4" />
                  System & User
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="ppe" className="space-y-4">
                {renderEventTypeTable('ppe')}
              </TabsContent>
              
              <TabsContent value="zone" className="space-y-4">
                {renderEventTypeTable('zone')}
              </TabsContent>
              
              <TabsContent value="environment" className="space-y-4">
                {renderEventTypeTable('environment')}
              </TabsContent>
              
              <TabsContent value="system" className="space-y-4">
                {renderEventTypeTable('system')}
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default EventsConfig;
