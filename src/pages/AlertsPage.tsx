
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Settings, FileVideo } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import CustomAlertDashboard from '@/components/alerts/CustomAlertDashboard';
import { AlertProvider } from '@/contexts/AlertContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import AlertDashboard from '@/components/alerts/AlertDashboard';
import { toast } from 'sonner';

const AlertsPage = () => {
  const navigate = useNavigate();
  const [enableHLS, setEnableHLS] = useState(() => {
    // Try to get saved preference from localStorage
    const saved = localStorage.getItem('enable-hls-player');
    return saved ? JSON.parse(saved) : true;
  });
  
  // Function to toggle HLS player preference
  const toggleHLSPlayer = () => {
    const newValue = !enableHLS;
    setEnableHLS(newValue);
    localStorage.setItem('enable-hls-player', JSON.stringify(newValue));
    
    toast.success(
      newValue 
        ? 'Enhanced HLS stream support enabled' 
        : 'Using standard video player'
    );
  };
  
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Alert Dashboard</h1>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={toggleHLSPlayer} 
            className="gap-2"
          >
            <FileVideo size={16} />
            {enableHLS ? 'Standard Player' : 'HLS Player'}
          </Button>
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
          <AlertProvider mockData={true} enableHLS={enableHLS}>
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
