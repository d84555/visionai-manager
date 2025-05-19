
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
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import SettingsService, { EventTypeConfig } from '@/services/SettingsService';

interface Event {
  id: string;
  timestamp: Date;
  type: string;
  category: 'ppe' | 'zone' | 'environment' | 'system';
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  details: {
    objectType?: string;
    confidence?: number;
    camera?: string;
    user?: string;
    action?: string;
    eventTypeId?: string;
    [key: string]: any;
  };
}

const EventLogging: React.FC = () => {
  const [events, setEvents] = useState<Event[]>([]);
  const [filteredEvents, setFilteredEvents] = useState<Event[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [currentTab, setCurrentTab] = useState('all');
  const [eventTypes, setEventTypes] = useState<EventTypeConfig[]>([]);
  const [enabledEventTypesOnly, setEnabledEventTypesOnly] = useState(true);

  useEffect(() => {
    // Load event types from settings
    setEventTypes(SettingsService.getEventTypes());
    
    // Generate mock events that use the configured event types
    const mockEvents: Event[] = [];
    const configuredEventTypes = SettingsService.getEventTypes();
    const cameraNames = ['Front Entrance', 'Parking Lot', 'Loading Dock', 'Perimeter'];
    const userNames = ['admin', 'operator', 'security', 'manager'];
    
    for (let i = 0; i < 100; i++) {
      const timestamp = new Date();
      timestamp.setHours(timestamp.getHours() - Math.random() * 168);
      
      // Select a random event type from the configured ones
      const eventType = configuredEventTypes[Math.floor(Math.random() * configuredEventTypes.length)];
      let description = '';
      let details: Record<string, any> = {
        camera: cameraNames[Math.floor(Math.random() * cameraNames.length)],
        eventTypeId: eventType.id
      };
      
      switch (eventType.category) {
        case 'ppe':
          details.confidence = 0.6 + (Math.random() * 0.4);
          details.objectType = 'person';
          details.zone = 'Work Zone';
          break;
        case 'zone':
          details.confidence = 0.7 + (Math.random() * 0.3);
          details.objectType = 'person';
          details.zone = 'Restricted Zone';
          details.duration = Math.floor(Math.random() * 60) + ' seconds';
          break;
        case 'environment':
          details.confidence = 0.8 + (Math.random() * 0.2);
          details.objectType = 'smoke';
          details.zone = 'Storage Area';
          break;
        case 'system':
          details.user = userNames[Math.floor(Math.random() * userNames.length)];
          details.action = eventType.name;
          details.component = 'Security System';
          break;
      }
      
      // Use the event type's details
      description = eventType.name;
      
      mockEvents.push({
        id: `event-${Date.now()}-${i}`,
        timestamp,
        type: eventType.name,
        category: eventType.category,
        description,
        severity: eventType.severity,
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
    
    // Filter by enabled event types if the toggle is on
    if (enabledEventTypesOnly) {
      const enabledEventTypeIds = eventTypes
        .filter(et => et.enabled)
        .map(et => et.id);
      
      filtered = filtered.filter(event => 
        enabledEventTypeIds.includes(event.details.eventTypeId as string)
      );
    }
    
    if (typeFilter !== 'all') {
      if (typeFilter.startsWith('category-')) {
        // Filter by category
        const category = typeFilter.replace('category-', '') as 'ppe' | 'zone' | 'environment' | 'system';
        filtered = filtered.filter(event => event.category === category);
      } else if (typeFilter.startsWith('severity-')) {
        // Filter by severity
        const severity = typeFilter.replace('severity-', '') as 'low' | 'medium' | 'high' | 'critical';
        filtered = filtered.filter(event => event.severity === severity);
      } else {
        // Filter by specific event type
        filtered = filtered.filter(event => event.details.eventTypeId === typeFilter);
      }
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
  }, [searchTerm, typeFilter, events, currentTab, enabledEventTypesOnly, eventTypes]);

  const formatTimestamp = (date: Date) => {
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const getTypeBadge = (event: Event) => {
    switch (event.category) {
      case 'ppe':
        return event.severity === 'low' ? 
          <Badge variant="outline" className="bg-green-100 text-green-800 hover:bg-green-200">PPE Compliant</Badge> :
          <Badge variant="destructive">PPE Violation</Badge>;
      case 'zone':
        return <Badge variant="secondary" className="bg-orange-100 text-orange-800 hover:bg-orange-200">Zone Violation</Badge>;
      case 'environment':
        return <Badge variant="destructive">Environment Alert</Badge>;
      case 'system':
        return <Badge variant="secondary">System</Badge>;
      default:
        return <Badge variant="outline">{event.type}</Badge>;
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
        return <Badge className="bg-red-500 text-white">Critical</Badge>;
      default:
        return <Badge variant="outline">{severity}</Badge>;
    }
  };
  
  const handleDownloadLogs = () => {
    alert('Event logs downloaded as CSV');
  };

  const renderEventTable = () => (
    <div className="rounded-md border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[180px]">Timestamp</TableHead>
            <TableHead className="w-[150px]">Type</TableHead>
            <TableHead className="w-[100px]">Severity</TableHead>
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
                <TableCell>{getTypeBadge(event)}</TableCell>
                <TableCell>{getSeverityBadge(event.severity)}</TableCell>
                <TableCell>{event.description}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(event.details)
                      .filter(([key]) => key !== 'eventTypeId') // Don't show internal ID
                      .map(([key, value]) => (
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
              <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                No events found matching your criteria
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );

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
              <div className="flex items-center space-x-2 mr-2">
                <label className="text-sm font-medium">
                  <input 
                    type="checkbox" 
                    className="mr-1"
                    checked={enabledEventTypesOnly}
                    onChange={(e) => setEnabledEventTypesOnly(e.target.checked)}
                  />
                  Show only enabled event types
                </label>
              </div>
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
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Filter by type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  
                  <SelectGroup>
                    <SelectLabel>By Category</SelectLabel>
                    <SelectItem value="category-ppe">PPE Compliance</SelectItem>
                    <SelectItem value="category-zone">Zone Violations</SelectItem>
                    <SelectItem value="category-environment">Environment</SelectItem>
                    <SelectItem value="category-system">System</SelectItem>
                  </SelectGroup>

                  <SelectGroup>
                    <SelectLabel>By Severity</SelectLabel>
                    <SelectItem value="severity-low">Low Severity</SelectItem>
                    <SelectItem value="severity-medium">Medium Severity</SelectItem>
                    <SelectItem value="severity-high">High Severity</SelectItem>
                    <SelectItem value="severity-critical">Critical Severity</SelectItem>
                  </SelectGroup>

                  {/* PPE Events */}
                  <SelectGroup>
                    <SelectLabel>PPE Events</SelectLabel>
                    {eventTypes
                      .filter(event => event.category === 'ppe')
                      .map(event => (
                        <SelectItem key={event.id} value={event.id}>{event.name}</SelectItem>
                      ))
                    }
                  </SelectGroup>

                  {/* Zone Events */}
                  <SelectGroup>
                    <SelectLabel>Zone Events</SelectLabel>
                    {eventTypes
                      .filter(event => event.category === 'zone')
                      .map(event => (
                        <SelectItem key={event.id} value={event.id}>{event.name}</SelectItem>
                      ))
                    }
                  </SelectGroup>

                  {/* Environment Events */}
                  <SelectGroup>
                    <SelectLabel>Environment Events</SelectLabel>
                    {eventTypes
                      .filter(event => event.category === 'environment')
                      .map(event => (
                        <SelectItem key={event.id} value={event.id}>{event.name}</SelectItem>
                      ))
                    }
                  </SelectGroup>

                  {/* System Events */}
                  <SelectGroup>
                    <SelectLabel>System Events</SelectLabel>
                    {eventTypes
                      .filter(event => event.category === 'system')
                      .map(event => (
                        <SelectItem key={event.id} value={event.id}>{event.name}</SelectItem>
                      ))
                    }
                  </SelectGroup>
                </SelectContent>
              </Select>
              <Button variant="outline" size="icon" onClick={handleDownloadLogs}>
                <Download size={16} />
              </Button>
            </div>
          </div>

          <TabsContent value="all" className="mt-0">
            {renderEventTable()}
          </TabsContent>
          
          <TabsContent value="today" className="mt-0">
            {renderEventTable()}
          </TabsContent>
          
          <TabsContent value="week" className="mt-0">
            {renderEventTable()}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default EventLogging;
