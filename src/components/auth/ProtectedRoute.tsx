
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredPermission?: string;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  requiredPermission
}) => {
  const { user, loading, hasPermission } = useAuth();
  const location = useLocation();
  
  if (loading) {
    return <div>Loading authentication...</div>;
  }
  
  if (!user) {
    // Redirect to login page but save the location they tried to access
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  
  if (requiredPermission && !hasPermission(requiredPermission)) {
    // User doesn't have required permission, redirect to home page
    return <Navigate to="/" replace />;
  }
  
  return <>{children}</>;
};

export default ProtectedRoute;
