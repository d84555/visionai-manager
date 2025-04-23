
import React, { createContext, useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import UserService, { User } from '@/services/UserService';
import { toast } from 'sonner';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  hasPermission: (permission: string) => boolean;
  canAccessCamera: (cameraId: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  // Check for logged in user on mount
  useEffect(() => {
    const currentUser = UserService.getCurrentUser();
    if (currentUser) {
      setUser(currentUser);
    }
    setLoading(false);
  }, []);

  const login = async (username: string, password: string): Promise<boolean> => {
    try {
      const authenticatedUser = UserService.authenticateUser(username, password);
      
      if (authenticatedUser) {
        setUser(authenticatedUser);
        toast.success(`Welcome back, ${authenticatedUser.fullName || authenticatedUser.username}`);
        return true;
      }
      
      toast.error('Invalid username or password');
      return false;
    } catch (error) {
      console.error('Login error:', error);
      toast.error('An error occurred during login');
      return false;
    }
  };

  const logout = () => {
    UserService.logout();
    setUser(null);
    navigate('/login');
    toast.info('You have been logged out');
  };

  const hasPermission = (permission: string): boolean => {
    return UserService.hasPermission(user || undefined, permission);
  };

  const canAccessCamera = (cameraId: string): boolean => {
    return UserService.canAccessCamera(user || undefined, cameraId);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, hasPermission, canAccessCamera }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
