import React, { useState, useEffect } from 'react';
import { FileText, Search, Filter, Calendar, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface Event {
  id: string;
  timestamp: Date;
  type: 'detection' | 'alert' | 'system' | 'user';
  description: string;
  details: {
    objectType?: string;
    confidence?: number;
    camera?: string;
    user?: string;
    action?: string;
    [key: string]: any;
  };
}

const EventLogging: React.FC = () => {
  const [events, setEvents] = useState<Event[]>([]);
  const [filteredEvents, setFilteredEvents] = useState<Event[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [currentTab, setCurrentTab] = useState('all');

  useEffect(() => {
    const eventTypes = ['detection', 'alert', 'system', 'user'];
    const objectTypes = ['person', 'car', 'truck', 'bicycle', 'motorcycle', 'bus', 'animal', 'unknown'];
    const cameraNames = ['Front Entrance', 'Parking Lot', 'Loading Dock', 'Perimeter'];
    const userActions = ['login', 'logout', 'settings change', 'alert dismissed', 'system restart'];
    
    const mockEvents: Event[] = [];
    
    for (let i = 0; i < 100; i++) {
      const timestamp = new Date();
      timestamp.setHours(timestamp.getHours() - Math.random() * 168);
      
      const type = eventTypes[Math.floor(Math.random() * eventTypes.length)] as Event['type'];
      let description = '';
      let details: Event['details'] = {};
      
      switch (type) {
        case 'detection':
          const objType = objectTypes[Math.floor(Math.random() * objectTypes.length)];
          const confidence = 0.6 + (Math.random() * 0.4);
          const camera = cameraNames[Math.floor(Math.random() * cameraNames.length)];
          description = `Detected ${objType} with ${(confidence * 100).toFixed(1)}% confidence`;
          details = { objectType: objType, confidence, camera };
          break;
        case 'alert':
          const alertObj = objectTypes[Math.floor(Math.random() * objectTypes.length)];
          description = `Alert triggered for ${alertObj}`;
          details = { 
            objectType: alertObj, 
            confidence: 0.8 + (Math.random() * 0.2),
            camera: cameraNames[Math.floor(Math.random() * cameraNames.length)]
          };
          break;
        case 'system':
          description = 'System ' + (Math.random() > 0.5 ? 'started' : 'configuration updated');
          details = { component: 'YOLOv11', status: 'active' };
          break;
        case 'user':
          const action = userActions[Math.floor(Math.random() * userActions.length)];
          const user = 'admin';
          description = `User ${user} performed ${action}`;
          details = { user, action };
          break;
      }
      
      mockEvents.push({
        id: `event-${Date.now()}-${i}`,
        timestamp,
        type,
        description,
        details
      });
    }
    
    mockEvents.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    
    setEvents(mockEvents);
    setFilteredEvents(mockEvents);
  }, []);

  useEffect(() => {
    let filtered = events;
    
    if (searchTerm) {
      filtered = filtered.filter(event => 
        event.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        Object.values(event.details)
          .filter(val => typeof val === 'string')
          .some(val => (val as string).toLowerCase().includes(searchTerm.toLowerCase()))
      );
    }
    
    if (typeFilter !== 'all') {
      filtered = filtered.filter(event => event.type === typeFilter);
    }
    
    if (currentTab !== 'all') {
      const now = new Date();
      const dayStart = new Date(now);
      dayStart.setHours(0, 0, 0, 0);
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - 7);
      
      if (currentTab === 'today') {
        filtered = filtered.filter(event => event.timestamp >= dayStart);
      } else if (currentTab === 'week') {
        filtered = filtered.filter(event => event.timestamp >= weekStart);
      }
    }
    
    setFilteredEvents(filtered);
  }, [searchTerm, typeFilter, events, currentTab]);

  const formatTimestamp = (date: Date) => {
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const getTypeBadge = (type: string) => {
    switch (type) {
      case 'detection':
        return <Badge variant="default">Detection</Badge>;
      case 'alert':
        return <Badge variant="destructive">Alert</Badge>;
      case 'system':
        return <Badge variant="secondary">System</Badge>;
      case 'user':
        return <Badge variant="outline">User</Badge>;
      default:
        return <Badge variant="outline">{type}</Badge>;
    }
  };
  
  const handleDownloadLogs = () => {
    alert('Event logs downloaded as CSV');
  };

  return (
    <Card className="w-full">
      <CardHeader className="border-b">
        <CardTitle className="flex items-center">
          <FileText className="mr-2 text-avianet-red" size={20} />
          Event Logging
        </CardTitle>
      </CardHeader>
      <CardContent className="p-6">
        <Tabs 
          defaultValue="all" 
          onValueChange={setCurrentTab}
          className="space-y-4"
        >
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
            <TabsList>
              <TabsTrigger value="all">All Events</TabsTrigger>
              <TabsTrigger value="today">Today</TabsTrigger>
              <TabsTrigger value="week">This Week</TabsTrigger>
            </TabsList>
            
            <div className="flex items-center space-x-2">
              <div className="relative max-w-xs">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search events..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8"
                />
              </div>
              <Select 
                value={typeFilter} 
                onValueChange={setTypeFilter}
              >
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Filter by type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="detection">Detection</SelectItem>
                  <SelectItem value="alert">Alert</SelectItem>
                  <SelectItem value="system">System</SelectItem>
                  <SelectItem value="user">User</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="icon" onClick={handleDownloadLogs}>
                <Download size={16} />
              </Button>
            </div>
          </div>

          <TabsContent value="all" className="mt-0">
            <div className="rounded-md border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[180px]">Timestamp</TableHead>
                    <TableHead className="w-[100px]">Type</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredEvents.length > 0 ? (
                    filteredEvents.map((event) => (
                      <TableRow key={event.id} className="event-row">
                        <TableCell className="font-mono text-xs">
                          {formatTimestamp(event.timestamp)}
                        </TableCell>
                        <TableCell>{getTypeBadge(event.type)}</TableCell>
                        <TableCell>{event.description}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-2">
                            {Object.entries(event.details).map(([key, value]) => (
                              <span key={key} className="inline-flex items-center text-xs bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded-md">
                                <span className="font-semibold mr-1">{key}:</span>
                                <span>
                                  {typeof value === 'number' && key === 'confidence'
                                    ? `${(value * 100).toFixed(1)}%`
                                    : String(value)}
                                </span>
                              </span>
                            ))}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                        No events found matching your criteria
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
          
          <TabsContent value="today" className="mt-0">
            <div className="rounded-md border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[180px]">Timestamp</TableHead>
                    <TableHead className="w-[100px]">Type</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredEvents.length > 0 ? (
                    filteredEvents.map((event) => (
                      <TableRow key={event.id} className="event-row">
                        <TableCell className="font-mono text-xs">
                          {formatTimestamp(event.timestamp)}
                        </TableCell>
                        <TableCell>{getTypeBadge(event.type)}</TableCell>
                        <TableCell>{event.description}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-2">
                            {Object.entries(event.details).map(([key, value]) => (
                              <span key={key} className="inline-flex items-center text-xs bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded-md">
                                <span className="font-semibold mr-1">{key}:</span>
                                <span>
                                  {typeof value === 'number' && key === 'confidence'
                                    ? `${(value * 100).toFixed(1)}%`
                                    : String(value)}
                                </span>
                              </span>
                            ))}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                        No events found for today
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
          
          <TabsContent value="week" className="mt-0">
            <div className="rounded-md border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[180px]">Timestamp</TableHead>
                    <TableHead className="w-[100px]">Type</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredEvents.length > 0 ? (
                    filteredEvents.map((event) => (
                      <TableRow key={event.id} className="event-row">
                        <TableCell className="font-mono text-xs">
                          {formatTimestamp(event.timestamp)}
                        </TableCell>
                        <TableCell>{getTypeBadge(event.type)}</TableCell>
                        <TableCell>{event.description}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-2">
                            {Object.entries(event.details).map(([key, value]) => (
                              <span key={key} className="inline-flex items-center text-xs bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded-md">
                                <span className="font-semibold mr-1">{key}:</span>
                                <span>
                                  {typeof value === 'number' && key === 'confidence'
                                    ? `${(value * 100).toFixed(1)}%`
                                    : String(value)}
                                </span>
                              </span>
                            ))}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                        No events found for this week
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default EventLogging;
