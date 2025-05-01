
import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import { Toaster } from '@/components/ui/sonner';

const AppLayout: React.FC = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const currentYear = new Date().getFullYear();
  
  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-white dark:bg-gray-900">
      <div className="flex flex-1 overflow-hidden">
        <Sidebar isOpen={sidebarOpen} toggle={toggleSidebar} />
        
        <div 
          className="flex-1 flex flex-col overflow-hidden md:ml-64"
          onClick={() => sidebarOpen && setSidebarOpen(false)}
        >
          <main className="flex-1 overflow-y-auto p-4 md:p-6">
            <div className="max-w-7xl mx-auto">
              <Outlet />
            </div>
          </main>
          
          <footer className="py-3 px-4 border-t text-center text-sm text-muted-foreground">
            © Copyright {currentYear} AVIANET | All Rights Reserved
          </footer>
        </div>
      </div>
      
      <Toaster />
    </div>
  );
};

export default AppLayout;
