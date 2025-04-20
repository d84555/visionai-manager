import React, { useState, useEffect } from 'react';
import { Bell, Filter, Search, Download } from 'lucide-react';
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface Alert {
  id: string;
  timestamp: Date;
  objectType: string;
  confidence: number;
  coordinates: { x: number; y: number };
  status: 'new' | 'reviewed' | 'ignored';
  metadata: {
    camera: string;
    zone: string;
    frameId: number;
  };
}

const AlertDashboard: React.FC = () => {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [filteredAlerts, setFilteredAlerts] = useState<Alert[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showAll, setShowAll] = useState(true);
  const [selectedAlert, setSelectedAlert] = useState<Alert | null>(null);

  useEffect(() => {
    const generateMockAlerts = () => {
      const objectTypes = [
        'person', 'car', 'truck', 'bicycle', 
        'motorcycle', 'bus', 'animal', 'unknown'
      ];
      const statuses: ('new' | 'reviewed' | 'ignored')[] = ['new', 'reviewed', 'ignored'];
      const cameraNames = ['Front Entrance', 'Parking Lot', 'Loading Dock', 'Perimeter'];
      const zones = ['Zone A', 'Zone B', 'Zone C', 'Restricted Area'];
      
      const mockAlerts: Alert[] = [];
      
      for (let i = 0; i < 20; i++) {
        const timestamp = new Date();
        timestamp.setHours(timestamp.getHours() - Math.random() * 24);
        
        mockAlerts.push({
          id: `alert-${Date.now()}-${i}`,
          timestamp,
          objectType: objectTypes[Math.floor(Math.random() * objectTypes.length)],
          confidence: 0.7 + (Math.random() * 0.3),
          coordinates: {
            x: Math.floor(Math.random() * 1280),
            y: Math.floor(Math.random() * 720)
          },
          status: statuses[Math.floor(Math.random() * statuses.length)],
          metadata: {
            camera: cameraNames[Math.floor(Math.random() * cameraNames.length)],
            zone: zones[Math.floor(Math.random() * zones.length)],
            frameId: Math.floor(Math.random() * 10000)
          }
        });
      }
      
      mockAlerts.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
      
      setAlerts(mockAlerts);
      setFilteredAlerts(mockAlerts);
    };
    
    generateMockAlerts();
  }, []);

  useEffect(() => {
    let filtered = alerts;
    
    if (searchTerm) {
      filtered = filtered.filter(alert => 
        alert.objectType.toLowerCase().includes(searchTerm.toLowerCase()) ||
        alert.metadata.camera.toLowerCase().includes(searchTerm.toLowerCase()) ||
        alert.metadata.zone.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    
    if (!showAll) {
      filtered = filtered.filter(alert => alert.status === 'new');
    }
    
    setFilteredAlerts(filtered);
  }, [searchTerm, showAll, alerts]);

  const formatTimestamp = (date: Date) => {
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'new':
        return <Badge variant="destructive">New</Badge>;
      case 'reviewed':
        return <Badge variant="default">Reviewed</Badge>;
      case 'ignored':
        return <Badge variant="secondary">Ignored</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const handleAlertUpdate = (id: string, status: 'new' | 'reviewed' | 'ignored') => {
    setAlerts(prevAlerts => 
      prevAlerts.map(alert => 
        alert.id === id ? { ...alert, status } : alert
      )
    );
    
    if (selectedAlert && selectedAlert.id === id) {
      setSelectedAlert({ ...selectedAlert, status });
    }
  };
  
  const handleDownloadCSV = () => {
    alert('Alert data downloaded as CSV');
  };

  return (
    <Card className="w-full">
      <CardHeader className="border-b">
        <CardTitle className="flex items-center">
          <Bell className="mr-2 text-avianet-red" size={20} />
          Alert Dashboard
        </CardTitle>
      </CardHeader>
      <CardContent className="p-6">
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row justify-between gap-4">
            <div className="flex w-full max-w-sm items-center space-x-2">
              <div className="relative max-w-xs">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search alerts..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8"
                />
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon">
                    <Filter size={16} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setShowAll(true)}>
                    Show All Alerts
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setShowAll(false)}>
                    Show New Alerts Only
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button variant="outline" size="icon" onClick={handleDownloadCSV}>
                <Download size={16} />
              </Button>
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-sm text-muted-foreground">
                {filteredAlerts.length} alerts {!showAll && "(new only)"}
              </span>
            </div>
          </div>

          <div className="rounded-md border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[180px]">Timestamp</TableHead>
                  <TableHead>Object Type</TableHead>
                  <TableHead>Confidence</TableHead>
                  <TableHead>Camera</TableHead>
                  <TableHead>Zone</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAlerts.length > 0 ? (
                  filteredAlerts.map((alert) => (
                    <TableRow key={alert.id} className="event-row">
                      <TableCell className="font-mono text-xs">
                        {formatTimestamp(alert.timestamp)}
                      </TableCell>
                      <TableCell>
                        <span className="capitalize">{alert.objectType}</span>
                      </TableCell>
                      <TableCell>
                        {(alert.confidence * 100).toFixed(1)}%
                      </TableCell>
                      <TableCell>{alert.metadata.camera}</TableCell>
                      <TableCell>{alert.metadata.zone}</TableCell>
                      <TableCell>{getStatusBadge(alert.status)}</TableCell>
                      <TableCell className="text-right">
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setSelectedAlert(alert)}
                            >
                              Details
                            </Button>
                          </DialogTrigger>
                          {selectedAlert && (
                            <DialogContent className="sm:max-w-md">
                              <DialogHeader>
                                <DialogTitle>Alert Details</DialogTitle>
                              </DialogHeader>
                              <div className="space-y-4 py-4">
                                <div className="grid grid-cols-2 gap-4">
                                  <div>
                                    <p className="text-sm font-medium">Timestamp</p>
                                    <p className="text-sm text-muted-foreground">
                                      {formatTimestamp(selectedAlert.timestamp)}
                                    </p>
                                  </div>
                                  <div>
                                    <p className="text-sm font-medium">Alert ID</p>
                                    <p className="text-sm font-mono text-muted-foreground">
                                      {selectedAlert.id.substring(0, 8)}...
                                    </p>
                                  </div>
                                  <div>
                                    <p className="text-sm font-medium">Object Type</p>
                                    <p className="text-sm text-muted-foreground capitalize">
                                      {selectedAlert.objectType}
                                    </p>
                                  </div>
                                  <div>
                                    <p className="text-sm font-medium">Confidence</p>
                                    <p className="text-sm text-muted-foreground">
                                      {(selectedAlert.confidence * 100).toFixed(1)}%
                                    </p>
                                  </div>
                                  <div>
                                    <p className="text-sm font-medium">Camera</p>
                                    <p className="text-sm text-muted-foreground">
                                      {selectedAlert.metadata.camera}
                                    </p>
                                  </div>
                                  <div>
                                    <p className="text-sm font-medium">Zone</p>
                                    <p className="text-sm text-muted-foreground">
                                      {selectedAlert.metadata.zone}
                                    </p>
                                  </div>
                                  <div>
                                    <p className="text-sm font-medium">Coordinates</p>
                                    <p className="text-sm text-muted-foreground">
                                      x: {selectedAlert.coordinates.x}, y: {selectedAlert.coordinates.y}
                                    </p>
                                  </div>
                                  <div>
                                    <p className="text-sm font-medium">Frame ID</p>
                                    <p className="text-sm text-muted-foreground">
                                      {selectedAlert.metadata.frameId}
                                    </p>
                                  </div>
                                </div>
                                
                                <div className="flex justify-between pt-4 border-t">
                                  <p className="text-sm font-medium">Status</p>
                                  <div className="flex gap-2">
                                    <Button
                                      variant={selectedAlert.status === 'new' ? 'destructive' : 'outline'}
                                      size="sm"
                                      onClick={() => handleAlertUpdate(selectedAlert.id, 'new')}
                                    >
                                      New
                                    </Button>
                                    <Button
                                      variant={selectedAlert.status === 'reviewed' ? 'default' : 'outline'}
                                      size="sm"
                                      onClick={() => handleAlertUpdate(selectedAlert.id, 'reviewed')}
                                    >
                                      Reviewed
                                    </Button>
                                    <Button
                                      variant={selectedAlert.status === 'ignored' ? 'secondary' : 'outline'} 
                                      size="sm"
                                      onClick={() => handleAlertUpdate(selectedAlert.id, 'ignored')}
                                    >
                                      Ignore
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            </DialogContent>
                          )}
                        </Dialog>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      No alerts found matching your criteria
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default AlertDashboard;
