
import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
  Video, 
  Bell, 
  FileText, 
  Brain, 
  Settings, 
  Menu, 
  Home 
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface SidebarProps {
  isOpen: boolean;
  toggle: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ isOpen, toggle }) => {
  const location = useLocation();
  
  const navItems = [
    { name: 'Home', path: '/', icon: <Home size={20} /> },
    { name: 'Video Feed', path: '/video', icon: <Video size={20} /> },
    { name: 'Alerts', path: '/alerts', icon: <Bell size={20} /> },
    { name: 'Event Logs', path: '/events', icon: <FileText size={20} /> },
    { name: 'AI Insights', path: '/insights', icon: <Brain size={20} /> },
    { name: 'Settings', path: '/settings', icon: <Settings size={20} /> },
  ];

  return (
    <>
      <Button 
        variant="ghost" 
        size="icon" 
        className="absolute top-4 left-4 md:hidden z-50" 
        onClick={toggle}
      >
        <Menu size={20} />
      </Button>
      
      <div 
        className={cn(
          'fixed top-0 left-0 h-full z-40 w-64 bg-avianet-black text-white transition-transform duration-300 ease-in-out',
          isOpen ? 'transform-none' : '-translate-x-full md:translate-x-0'
        )}
      >
        <div className="p-4 border-b border-gray-800">
          <div className="flex items-center space-x-2">
            <div className="h-2 w-2 rounded-full bg-avianet-red animate-pulse"></div>
            <h1 className="text-xl font-bold">Avianet Vision</h1>
          </div>
        </div>
        
        <nav className="p-4">
          <ul className="space-y-2">
            {navItems.map((item) => (
              <li key={item.path}>
                <Link 
                  to={item.path} 
                  className={cn(
                    'flex items-center space-x-3 px-3 py-2 rounded-md transition-colors',
                    location.pathname === item.path 
                      ? 'bg-avianet-red text-white' 
                      : 'hover:bg-gray-800'
                  )}
                >
                  {item.icon}
                  <span>{item.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </>
  );
};

export default Sidebar;
