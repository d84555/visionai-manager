
import React, { useEffect, useState } from 'react';
import { User } from '@/services/UserService';
import CameraService, { Camera } from '@/services/CameraService';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { DialogFooter } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import UserService from '@/services/UserService';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

interface UserAssignCamerasProps {
  user: User;
  onSave: () => void;
  onCancel: () => void;
}

const UserAssignCameras: React.FC<UserAssignCamerasProps> = ({ user, onSave, onCancel }) => {
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [selectedCameraIds, setSelectedCameraIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  useEffect(() => {
    // Load all cameras
    const allCameras = CameraService.getAllCameras();
    setCameras(allCameras);
    
    // Set the user's currently assigned cameras
    setSelectedCameraIds(user.assignedCameraIds || []);
  }, [user]);
  
  const handleToggleCamera = (cameraId: string) => {
    setSelectedCameraIds(prev => {
      if (prev.includes(cameraId)) {
        return prev.filter(id => id !== cameraId);
      } else {
        return [...prev, cameraId];
      }
    });
  };
  
  const handleSelectAll = () => {
    setSelectedCameraIds(cameras.map(camera => camera.id));
  };
  
  const handleSelectNone = () => {
    setSelectedCameraIds([]);
  };
  
  const handleSave = async () => {
    setIsSubmitting(true);
    try {
      UserService.assignCamerasToUser(user.id, selectedCameraIds);
      onSave();
    } catch (error) {
      toast.error(`Failed to assign cameras: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsSubmitting(false);
    }
  };
  
  return (
    <div className="space-y-6">
      <div className="flex justify-between mb-2">
        <div className="text-sm text-muted-foreground">
          Select cameras that this user can access.
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={handleSelectAll}>
            Select All
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={handleSelectNone}>
            Select None
          </Button>
        </div>
      </div>
      
      <ScrollArea className="h-[300px] border rounded-md p-4">
        <div className="space-y-4">
          {cameras.length === 0 ? (
            <div className="text-center py-4 text-muted-foreground">
              No cameras available
            </div>
          ) : (
            cameras.map((camera) => (
              <div key={camera.id} className="flex items-center space-x-2 py-2 border-b last:border-b-0">
                <Checkbox
                  id={`camera-${camera.id}`}
                  checked={selectedCameraIds.includes(camera.id)}
                  onCheckedChange={() => handleToggleCamera(camera.id)}
                />
                <label
                  htmlFor={`camera-${camera.id}`}
                  className="flex-1 text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                >
                  <div>{camera.name}</div>
                  <div className="text-xs text-muted-foreground mt-1">{camera.ipAddress} (ID: {camera.id})</div>
                </label>
                <div className={`w-3 h-3 rounded-full ${camera.isOnline ? 'bg-green-500' : 'bg-red-500'}`}></div>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
      
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            'Save Assignments'
          )}
        </Button>
      </DialogFooter>
    </div>
  );
};

export default UserAssignCameras;
