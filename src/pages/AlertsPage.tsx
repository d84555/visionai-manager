
import React from 'react';
import AlertDashboard from '@/components/alerts/AlertDashboard';
import { Button } from '@/components/ui/button';
import { Settings } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const AlertsPage = () => {
  const navigate = useNavigate();
  
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Alert Dashboard</h1>
        <Button onClick={() => navigate('/settings')} variant="outline">
          <Settings className="mr-2" size={16} />
          Configure Alerts
        </Button>
      </div>
      
      <AlertDashboard />
    </div>
  );
};

export default AlertsPage;
