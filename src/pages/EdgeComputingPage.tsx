
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import EdgeDeviceManager from '@/components/edge/EdgeDeviceManager';
import EdgeDeviceMetrics from '@/components/edge/EdgeDeviceMetrics';
import EdgeModelDeployment from '@/components/edge/EdgeModelDeployment';
import EdgeDeviceList from '@/components/edge/EdgeDeviceList';
import { EdgeDevice } from '@/components/edge/EdgeDeviceManager';
import { toast } from 'sonner';
import ManualEdgeDeviceForm from '@/components/edge/ManualEdgeDeviceForm';
import EdgeManagementService from '@/services/EdgeManagementService';
import { Button } from '@/components/ui/button';
import { Trash, AlertCircle } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const EdgeComputingPage = () => {
  // Sample placeholder device for when no device is selected
  const [selectedDevice, setSelectedDevice] = useState<EdgeDevice>({
    id: 'placeholder',
    name: 'Select a device',
    type: 'None',
    status: 'offline',
    lastSeen: new Date(),
    metrics: {
      cpu: 0,
      gpu: 0,
      ram: 0,
      storage: 0,
      temperature: 0,
      inferenceTime: 0,
      inferenceCount: 0
    },
    models: [],
    cameras: [],
    ipAddress: '',
    hwAcceleration: 'OpenVINO'
  });
  
  const [manualDevices, setManualDevices] = useState<any[]>([]);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deviceToDelete, setDeviceToDelete] = useState<string | null>(null);

  // Load saved edge devices on mount
  useEffect(() => {
    const loadedDevices = EdgeManagementService.getAllEdgeDevices();
    setManualDevices(loadedDevices);
  }, []);

  // Handlers for device selection and model management
  const handleDeviceSelect = (device: EdgeDevice) => {
    setSelectedDevice(device);
  };
  
  const handleModelDeployed = (modelId: string) => {
    if (!selectedDevice.models.includes(modelId)) {
      setSelectedDevice(prev => ({
        ...prev,
        models: [...prev.models, modelId]
      }));
      toast.success(`Model deployed to ${selectedDevice.name}`);
    }
  };
  
  const handleModelRemoved = (modelId: string) => {
    setSelectedDevice(prev => ({
      ...prev,
      models: prev.models.filter(m => m !== modelId)
    }));
    toast.info(`Model removed from ${selectedDevice.name}`);
  };
  
  const handleDeviceAdded = () => {
    // Reload devices from storage
    const updatedDevices = EdgeManagementService.getAllEdgeDevices();
    setManualDevices(updatedDevices);
    toast.success('Edge device list updated');
  };
  
  const confirmDeleteDevice = (deviceId: string) => {
    setDeviceToDelete(deviceId);
    setIsDeleteDialogOpen(true);
  };
  
  const handleDeleteDevice = () => {
    if (deviceToDelete) {
      EdgeManagementService.deleteEdgeDevice(deviceToDelete);
      
      // Update the local state
      const updatedDevices = EdgeManagementService.getAllEdgeDevices();
      setManualDevices(updatedDevices);
      
      // Reset selected device if it was deleted
      if (selectedDevice.id === deviceToDelete) {
        setSelectedDevice({
          id: 'placeholder',
          name: 'Select a device',
          type: 'None',
          status: 'offline',
          lastSeen: new Date(),
          metrics: {
            cpu: 0,
            gpu: 0,
            ram: 0,
            storage: 0,
            temperature: 0,
            inferenceTime: 0,
            inferenceCount: 0
          },
          models: [],
          cameras: [],
          ipAddress: '',
          hwAcceleration: 'OpenVINO'
        });
      }
      
      setDeviceToDelete(null);
    }
    setIsDeleteDialogOpen(false);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">Edge Computing</h1>
        <p className="text-muted-foreground">
          Manage edge devices and model deployments for distributed processing
        </p>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle>Edge Device Management</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="devices">
            <TabsList className="grid grid-cols-3 mb-6">
              <TabsTrigger value="devices">Edge Devices</TabsTrigger>
              <TabsTrigger value="manual">Manual Setup</TabsTrigger>
              <TabsTrigger value="metrics">Performance</TabsTrigger>
            </TabsList>
            
            <TabsContent value="devices">
              <EdgeDeviceManager onDeviceSelect={handleDeviceSelect} />
            </TabsContent>
            
            <TabsContent value="manual">
              <div className="space-y-6">
                <ManualEdgeDeviceForm onDeviceAdded={handleDeviceAdded} />
                
                <div className="border rounded-md">
                  <h3 className="font-medium px-4 py-2 border-b">Manually Added Devices</h3>
                  
                  {manualDevices.length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground">
                      <p>No manual devices added yet</p>
                      <p className="text-sm mt-2">Use the form above to add your first device</p>
                    </div>
                  ) : (
                    <div className="divide-y">
                      {manualDevices.map(device => (
                        <div key={device.id} className="flex items-center justify-between p-4">
                          <div>
                            <h4 className="font-medium">{device.name}</h4>
                            <p className="text-sm text-muted-foreground">{device.ipAddress}</p>
                            <div className="mt-1">
                              <span className={`inline-block px-2 py-1 text-xs rounded-full ${
                                device.status === 'online' ? 'bg-green-100 text-green-800' :
                                device.status === 'degraded' ? 'bg-yellow-100 text-yellow-800' :
                                'bg-gray-100 text-gray-800'
                              }`}>
                                {device.status}
                              </span>
                            </div>
                          </div>
                          <Button 
                            variant="destructive" 
                            size="sm" 
                            onClick={() => confirmDeleteDevice(device.id)}
                          >
                            <Trash className="h-4 w-4 mr-1" />
                            Remove
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>
            
            <TabsContent value="metrics">
              <EdgeDeviceMetrics device={selectedDevice} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader>
          <CardTitle>Model Deployment</CardTitle>
        </CardHeader>
        <CardContent>
          <EdgeModelDeployment 
            device={selectedDevice}
            onModelDeployed={handleModelDeployed}
            onModelRemoved={handleModelRemoved}
          />
        </CardContent>
      </Card>
      
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center">
              <AlertCircle className="h-5 w-5 mr-2 text-destructive" />
              Delete Edge Device
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this edge device? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteDevice} className="bg-destructive text-destructive-foreground">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default EdgeComputingPage;
