
import React, { useState } from 'react';
import { ManualEdgeDevice } from '@/services/EdgeDeviceService';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RefreshCw, Trash, Edit, Server, Layers, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import EdgeDeviceService from '@/services/EdgeDeviceService';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface EdgeDeviceItemProps {
  device: ManualEdgeDevice;
  onUpdate: () => void;
}

const EdgeDeviceItem: React.FC<EdgeDeviceItemProps> = ({ device, onUpdate }) => {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  
  const handleRefreshStatus = async () => {
    setIsRefreshing(true);
    try {
      await EdgeDeviceService.testDeviceConnectivity(device);
      
      // Update device status to online
      const updatedDevice = {
        ...device,
        status: 'online',
        lastConnection: new Date().toISOString()
      };
      
      await EdgeDeviceService.updateManualEdgeDevice(updatedDevice);
      onUpdate();
      
      toast.success('Device is online', {
        description: `Successfully connected to ${device.name}`
      });
    } catch (error) {
      // Update device status to offline
      const updatedDevice = {
        ...device,
        status: 'offline'
      };
      await EdgeDeviceService.updateManualEdgeDevice(updatedDevice);
      onUpdate();
      
      toast.error('Device connectivity failed', {
        description: `Could not establish connection to ${device.name}`
      });
    } finally {
      setIsRefreshing(false);
    }
  };
  
  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await EdgeDeviceService.deleteManualEdgeDevice(device.id);
      toast.success('Device deleted', {
        description: `${device.name} has been removed`
      });
      onUpdate();
    } catch (error) {
      toast.error('Failed to delete device', {
        description: 'Please try again later'
      });
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };
  
  const renderStatusBadge = () => {
    switch(device.status) {
      case 'online':
        return (
          <Badge className="bg-green-500">
            <CheckCircle className="h-3 w-3 mr-1" />
            Online
          </Badge>
        );
      case 'degraded':
        return (
          <Badge variant="outline" className="text-yellow-600 border-yellow-600">
            <AlertTriangle className="h-3 w-3 mr-1" />
            Degraded
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="text-red-500 border-red-500">
            <XCircle className="h-3 w-3 mr-1" />
            Offline
          </Badge>
        );
    }
  };
  
  return (
    <>
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center">
              <Server className="h-4 w-4 mr-2 text-avianet-red" />
              {device.name}
            </CardTitle>
            {renderStatusBadge()}
          </div>
        </CardHeader>
        <CardContent className="pb-2">
          <div className="space-y-1 text-sm">
            <p className="text-muted-foreground flex items-center">
              <span className="font-medium mr-2">IP Address:</span> {device.ipAddress}
            </p>
            {device.lastConnection && (
              <p className="text-muted-foreground flex items-center">
                <span className="font-medium mr-2">Last Connected:</span> 
                {new Date(device.lastConnection).toLocaleString()}
              </p>
            )}
            {device.models.length > 0 ? (
              <div className="flex items-center mt-2">
                <span className="font-medium text-sm mr-2">Models:</span>
                <div className="flex flex-wrap gap-1">
                  {device.models.map((model, index) => (
                    <Badge key={index} variant="outline" className="text-xs">
                      <Layers className="h-3 w-3 mr-1" />
                      {model}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No models deployed</p>
            )}
          </div>
        </CardContent>
        <CardFooter className="pt-0">
          <div className="flex justify-between w-full">
            <Button 
              variant="outline" 
              size="sm"
              disabled={isRefreshing}
              onClick={handleRefreshStatus}
            >
              <RefreshCw className={`h-3.5 w-3.5 mr-1 ${isRefreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <div className="space-x-2">
              <Button variant="outline" size="sm">
                <Edit className="h-3.5 w-3.5 mr-1" />
                Edit
              </Button>
              <Button 
                variant="destructive" 
                size="sm"
                onClick={() => setShowDeleteConfirm(true)}
                disabled={isDeleting}
              >
                <Trash className="h-3.5 w-3.5 mr-1" />
                Delete
              </Button>
            </div>
          </div>
        </CardFooter>
      </Card>
      
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Edge Computing Device</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {device.name}? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDelete} 
              className="bg-red-500 hover:bg-red-600"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default EdgeDeviceItem;
