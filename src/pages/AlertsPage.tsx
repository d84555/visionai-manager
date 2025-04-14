
import React from 'react';
import AlertDashboard from '@/components/alerts/AlertDashboard';

const AlertsPage = () => {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Alert Dashboard</h1>
      </div>
      
      <AlertDashboard />
    </div>
  );
};

export default AlertsPage;
