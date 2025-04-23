
import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { 
  Video, 
  Bell, 
  FileText, 
  Brain, 
  Settings, 
  Menu, 
  Home,
  LogOut,
  User,
  Users,
  Server,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface SidebarProps {
  isOpen: boolean;
  toggle: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ isOpen, toggle }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout, hasPermission } = useAuth();
  
  const navItems = [
    { name: 'Home', path: '/', icon: <Home size={20} /> },
    { name: 'Video Feed', path: '/video', icon: <Video size={20} />, permission: 'view_cameras' },
    { name: 'Alerts', path: '/alerts', icon: <Bell size={20} /> },
    { name: 'Event Logs', path: '/events', icon: <FileText size={20} /> },
    { name: 'AI Insights', path: '/insights', icon: <Brain size={20} /> },
    { name: 'Edge Computing', path: '/edge', icon: <Server size={20} /> },
    { name: 'Settings', path: '/settings', icon: <Settings size={20} /> },
  ];

  // Filter nav items based on permissions
  const filteredNavItems = navItems.filter(item => 
    !item.permission || hasPermission(item.permission)
  );
  
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(part => part.charAt(0))
      .join('')
      .toUpperCase()
      .substring(0, 2);
  };

  const handleLogout = () => {
    logout();
  };

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
        
        {/* User section */}
        <div className="p-4 border-b border-gray-800">
          <div className="flex items-center space-x-3">
            <Avatar>
              <AvatarFallback className="bg-avianet-red">
                {user ? getInitials(user.fullName || user.username) : '??'}
              </AvatarFallback>
            </Avatar>
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="p-0 h-auto text-left hover:bg-transparent">
                  <div className="flex flex-col">
                    <span className="font-medium">{user?.fullName || user?.username}</span>
                    <span className="text-xs text-gray-400 capitalize">{user?.role}</span>
                  </div>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56" align="start" side="right">
                <DropdownMenuLabel>My Account</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem onClick={() => navigate('/profile')}>
                    <User className="mr-2 h-4 w-4" />
                    <span>Profile</span>
                  </DropdownMenuItem>
                  
                  {hasPermission('manage_users') && (
                    <DropdownMenuItem onClick={() => navigate('/user-management')}>
                      <Users className="mr-2 h-4 w-4" />
                      <span>User Management</span>
                    </DropdownMenuItem>
                  )}
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout}>
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Log out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        
        <nav className="p-4">
          <ul className="space-y-2">
            {filteredNavItems.map((item) => (
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
        
        <div className="absolute bottom-4 left-0 right-0 p-4">
          <Button
            variant="ghost"
            className="w-full flex items-center justify-center space-x-2 hover:bg-gray-800"
            onClick={handleLogout}
          >
            <LogOut size={16} />
            <span>Log Out</span>
          </Button>
        </div>
      </div>
    </>
  );
};

export default Sidebar;
