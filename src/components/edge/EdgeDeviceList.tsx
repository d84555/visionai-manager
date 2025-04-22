
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Server, Trash, Edit } from 'lucide-react';
import { toast } from 'sonner';
import EdgeDeviceService, { ManualEdgeDevice } from '@/services/EdgeDeviceService';
import ManualEdgeDeviceForm from './ManualEdgeDeviceForm';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const EdgeDeviceList = () => {
  const [devices, setDevices] = useState<ManualEdgeDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingDevice, setEditingDevice] = useState<ManualEdgeDevice | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);

  // Function to load devices
  const loadDevices = async () => {
    setLoading(true);
    try {
      const allDevices = await EdgeDeviceService.getAllEdgeDevices();
      setDevices(allDevices);
    } catch (error) {
      console.error('Failed to load edge devices:', error);
      toast.error('Failed to load edge devices');
    } finally {
      setLoading(false);
    }
  };

  // Load devices on component mount
  useEffect(() => {
    loadDevices();
  }, []);

  // Handle device updates
  const handleDeviceUpdate = async (device: ManualEdgeDevice) => {
    try {
      await EdgeDeviceService.updateManualEdgeDevice(device);
      setIsDialogOpen(false);
      loadDevices();
    } catch (error) {
      console.error('Failed to update device:', error);
      toast.error('Failed to update device');
    }
  };

  // Handle device deletion
  const handleDeviceDelete = async (deviceId: string) => {
    setIsDeleting(deviceId);
    try {
      await EdgeDeviceService.deleteManualEdgeDevice(deviceId);
      loadDevices();
      toast.success('Edge device removed');
    } catch (error) {
      console.error('Failed to delete device:', error);
      toast.error('Failed to delete device');
    } finally {
      setIsDeleting(null);
    }
  };

  // Test device connectivity
  const testDeviceConnection = async (device: ManualEdgeDevice) => {
    try {
      await EdgeDeviceService.testDeviceConnectivity(device);
      
      // Update last connection time and status
      const updatedDevice = {
        ...device,
        status: 'online' as const,
        lastConnection: new Date().toISOString(),
      };
      
      await EdgeDeviceService.updateManualEdgeDevice(updatedDevice);
      loadDevices();
      
      toast.success(`Successfully connected to ${device.name}`);
    } catch (error) {
      console.error('Failed to connect to device:', error);
      toast.error(`Could not connect to ${device.name}`);
      
      // Update status to offline
      const updatedDevice = {
        ...device,
        status: 'offline' as const,
      };
      
      await EdgeDeviceService.updateManualEdgeDevice(updatedDevice);
      loadDevices();
    }
  };

  // Render status badge
  const renderStatusBadge = (status: 'online' | 'offline' | 'degraded') => {
    switch (status) {
      case 'online':
        return <Badge className="bg-green-500">Online</Badge>;
      case 'offline':
        return <Badge variant="destructive">Offline</Badge>;
      case 'degraded':
        return <Badge variant="outline" className="text-orange-500 border-orange-500">Degraded</Badge>;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      <ManualEdgeDeviceForm onDeviceAdded={loadDevices} />
      
      {loading ? (
        <div className="flex justify-center py-8">
          <div className="animate-spin">⏳</div>
        </div>
      ) : devices.length === 0 ? (
        <Card className="w-full">
          <CardContent className="p-6 text-center text-muted-foreground">
            <Server className="mx-auto mb-2" size={24} />
            <p>No edge devices have been added yet.</p>
            <p className="text-sm">Add your first device using the button above.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <h2 className="text-lg font-medium mt-4">Manually Added Devices</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {devices.map(device => (
              <Card key={device.id} className="w-full">
                <CardHeader className="pb-3">
                  <div className="flex justify-between items-start">
                    <div className="space-y-1">
                      <CardTitle className="text-lg">{device.name}</CardTitle>
                      <p className="text-sm text-muted-foreground">{device.ipAddress}</p>
                    </div>
                    {renderStatusBadge(device.status)}
                  </div>
                </CardHeader>
                <CardContent className="pb-3">
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">ID:</span>
                      <span className="font-mono">{device.id}</span>
                    </div>
                    {device.lastConnection && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Last Connection:</span>
                        <span>{new Date(device.lastConnection).toLocaleString()}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Authentication:</span>
                      <span>{device.authToken ? 'Enabled' : 'None'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Models:</span>
                      <span>{device.models.length ? device.models.join(', ') : 'None'}</span>
                    </div>
                  </div>
                  
                  <div className="flex space-x-2 mt-4">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="flex-1"
                      onClick={() => testDeviceConnection(device)}
                    >
                      Test Connection
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="flex-1"
                      onClick={() => {
                        setEditingDevice(device);
                        setIsDialogOpen(true);
                      }}
                    >
                      <Edit size={16} className="mr-1" /> Edit
                    </Button>
                    <Button 
                      variant="destructive" 
                      size="sm"
                      onClick={() => handleDeviceDelete(device.id)}
                      disabled={isDeleting === device.id}
                    >
                      {isDeleting === device.id ? (
                        <span className="animate-spin">⏳</span>
                      ) : (
                        <Trash size={16} />
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
      
      {/* Edit Device Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Edge Device</DialogTitle>
          </DialogHeader>
          
          {editingDevice && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit-name">Device Name</Label>
                <Input
                  id="edit-name"
                  value={editingDevice.name}
                  onChange={(e) => setEditingDevice({...editingDevice, name: e.target.value})}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="edit-ip">IP Address or Hostname</Label>
                <Input
                  id="edit-ip"
                  value={editingDevice.ipAddress}
                  onChange={(e) => setEditingDevice({...editingDevice, ipAddress: e.target.value})}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="edit-token">Authentication Token</Label>
                <Input
                  id="edit-token"
                  type="password"
                  value={editingDevice.authToken || ''}
                  onChange={(e) => setEditingDevice({...editingDevice, authToken: e.target.value})}
                  placeholder="Leave empty for no authentication"
                />
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setIsDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button 
              onClick={() => editingDevice && handleDeviceUpdate(editingDevice)}
            >
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default EdgeDeviceList;
