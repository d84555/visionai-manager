
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
import { useAlerts, Alert } from '@/contexts/AlertContext';

const CustomAlertDashboard: React.FC = () => {
  const { alerts, updateAlertStatus } = useAlerts();
  const [filteredAlerts, setFilteredAlerts] = useState<Alert[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showAll, setShowAll] = useState(true);
  const [selectedAlert, setSelectedAlert] = useState<Alert | null>(null);

  useEffect(() => {
    let filtered = alerts;
    
    if (searchTerm) {
      filtered = filtered.filter(alert => 
        alert.eventType.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
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

  const getSourceBadge = (sourceType: string | undefined) => {
    switch (sourceType) {
      case 'rtsp':
        return <Badge variant="outline" className="bg-blue-500 text-white">RTSP</Badge>;
      case 'upload':
        return <Badge variant="outline" className="bg-purple-500 text-white">Upload</Badge>;
      case 'mock':
        return <Badge variant="outline" className="bg-gray-400">Mock</Badge>;
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };
  
  const handleDownloadCSV = () => {
    // Convert alerts to CSV format
    const headers = ['Timestamp', 'Event Type', 'Severity', 'Confidence', 'Camera', 'Zone', 'Status'];
    const csvRows = [headers];
    
    filteredAlerts.forEach(alert => {
      csvRows.push([
        formatTimestamp(alert.timestamp),
        alert.eventType.name,
        alert.eventType.severity,
        `${(alert.confidence * 100).toFixed(1)}%`,
        alert.metadata.camera,
        alert.metadata.zone,
        alert.status
      ]);
    });
    
    const csvContent = csvRows.map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `alerts-export-${new Date().toISOString().slice(0, 10)}.csv`);
    link.click();
  };

  return (
    <Card className="w-full">
      <CardHeader className="border-b">
        <CardTitle className="flex items-center">
          <Bell className="mr-2 text-avianet-red" size={20} />
          Alert Dashboard (Custom)
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
                  <TableHead>Event Type</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Confidence</TableHead>
                  <TableHead>Camera</TableHead>
                  <TableHead>Source</TableHead>
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
                        <span>{alert.eventType.name}</span>
                      </TableCell>
                      <TableCell>
                        {getSeverityBadge(alert.eventType.severity)}
                      </TableCell>
                      <TableCell>
                        {(alert.confidence * 100).toFixed(1)}%
                      </TableCell>
                      <TableCell>{alert.metadata.camera}</TableCell>
                      <TableCell>{getSourceBadge(alert.metadata.sourceType)}</TableCell>
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
                                    <p className="text-sm font-medium">Event Type</p>
                                    <p className="text-sm text-muted-foreground">
                                      {selectedAlert.eventType.name}
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
                                  <div>
                                    <p className="text-sm font-medium">Category</p>
                                    <p className="text-sm text-muted-foreground capitalize">
                                      {selectedAlert.eventType.category}
                                    </p>
                                  </div>
                                  <div>
                                    <p className="text-sm font-medium">Severity</p>
                                    <p className="text-sm flex items-center gap-2">
                                      {getSeverityBadge(selectedAlert.eventType.severity)}
                                    </p>
                                  </div>
                                  {selectedAlert.metadata.sourceType && (
                                    <div>
                                      <p className="text-sm font-medium">Source Type</p>
                                      <p className="text-sm flex items-center gap-2">
                                        {getSourceBadge(selectedAlert.metadata.sourceType)}
                                      </p>
                                    </div>
                                  )}
                                  {selectedAlert.metadata.sourceUrl && (
                                    <div>
                                      <p className="text-sm font-medium">Source URL</p>
                                      <p className="text-sm text-muted-foreground truncate" title={selectedAlert.metadata.sourceUrl}>
                                        {selectedAlert.metadata.sourceUrl}
                                      </p>
                                    </div>
                                  )}
                                </div>
                                
                                <div className="flex justify-between pt-4 border-t">
                                  <p className="text-sm font-medium">Status</p>
                                  <div className="flex gap-2">
                                    <Button
                                      variant={selectedAlert.status === 'new' ? 'destructive' : 'outline'}
                                      size="sm"
                                      onClick={() => updateAlertStatus(selectedAlert.id, 'new')}
                                    >
                                      New
                                    </Button>
                                    <Button
                                      variant={selectedAlert.status === 'reviewed' ? 'default' : 'outline'}
                                      size="sm"
                                      onClick={() => updateAlertStatus(selectedAlert.id, 'reviewed')}
                                    >
                                      Reviewed
                                    </Button>
                                    <Button
                                      variant={selectedAlert.status === 'ignored' ? 'secondary' : 'outline'} 
                                      size="sm"
                                      onClick={() => updateAlertStatus(selectedAlert.id, 'ignored')}
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
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
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

export default CustomAlertDashboard;
