
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import EdgeDeviceManager from '@/components/edge/EdgeDeviceManager';
import EdgeDeviceMetrics from '@/components/edge/EdgeDeviceMetrics';
import EdgeModelDeployment from '@/components/edge/EdgeModelDeployment';
import EdgeDeviceList from '@/components/edge/EdgeDeviceList';

const EdgeComputingPage = () => {
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
              <EdgeDeviceManager />
            </TabsContent>
            
            <TabsContent value="manual">
              <EdgeDeviceList />
            </TabsContent>
            
            <TabsContent value="metrics">
              <EdgeDeviceMetrics />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader>
          <CardTitle>Model Deployment</CardTitle>
        </CardHeader>
        <CardContent>
          <EdgeModelDeployment />
        </CardContent>
      </Card>
    </div>
  );
};

export default EdgeComputingPage;
