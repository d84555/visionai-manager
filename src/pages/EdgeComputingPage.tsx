
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import EdgeDeviceManager from '@/components/edge/EdgeDeviceManager';
import EdgeDeviceMetrics from '@/components/edge/EdgeDeviceMetrics';
import EdgeModelDeployment from '@/components/edge/EdgeModelDeployment';
import EdgeDeviceList from '@/components/edge/EdgeDeviceList';
import { EdgeDevice } from '@/components/edge/EdgeDeviceManager';
import { toast } from 'sonner';

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
              <EdgeDeviceList />
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
    </div>
  );
};

export default EdgeComputingPage;
