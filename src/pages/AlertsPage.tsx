
import React from 'react';
import { Button } from '@/components/ui/button';
import { Settings } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import CustomAlertDashboard from '@/components/alerts/CustomAlertDashboard';
import { AlertProvider } from '@/contexts/AlertContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import AlertDashboard from '@/components/alerts/AlertDashboard';

const AlertsPage = () => {
  const navigate = useNavigate();
  
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Alert Dashboard</h1>
        <div className="flex gap-2">
          <Button onClick={() => navigate('/settings')} variant="outline">
            <Settings className="mr-2" size={16} />
            Configure Alerts
          </Button>
        </div>
      </div>
      
      <Tabs defaultValue="custom" className="w-full">
        <TabsList>
          <TabsTrigger value="custom">Integrated Alerts</TabsTrigger>
          <TabsTrigger value="default">Standard Alerts</TabsTrigger>
        </TabsList>
        <TabsContent value="custom">
          <AlertProvider mockData={true}>
            <CustomAlertDashboard />
          </AlertProvider>
        </TabsContent>
        <TabsContent value="default">
          <AlertDashboard />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AlertsPage;
