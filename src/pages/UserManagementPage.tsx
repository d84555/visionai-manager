
import React from 'react';
import UserManagement from '@/components/user/UserManagement';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { Shield } from 'lucide-react';

const UserManagementPage: React.FC = () => {
  const { hasPermission } = useAuth();
  const navigate = useNavigate();
  
  // Only admins should access this page
  if (!hasPermission('manage_users')) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] p-4">
        <Shield className="h-16 w-16 text-muted-foreground mb-4" />
        <h1 className="text-2xl font-bold mb-2">Access Denied</h1>
        <p className="text-muted-foreground mb-6 text-center max-w-md">
          You don't have permission to access the User Management section.
          Only administrators can manage users.
        </p>
        <Button onClick={() => navigate('/')}>
          Return to Dashboard
        </Button>
      </div>
    );
  }
  
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">User Management</h1>
      </div>
      
      <UserManagement />
    </div>
  );
};

export default UserManagementPage;
