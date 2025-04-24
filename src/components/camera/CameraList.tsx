
import React, { useState, useEffect } from 'react';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import CameraService from '@/services/CameraService';
import { Camera } from '@/services/CameraService';
import CameraForm from './CameraForm';
import { AlertCircle, Video, Trash, Plus } from 'lucide-react';
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

interface CameraListProps {
  onCamerasChanged?: () => void;
}

const CameraList: React.FC<CameraListProps> = ({ onCamerasChanged }) => {
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [selectedCameras, setSelectedCameras] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [isAddingCamera, setIsAddingCamera] = useState<boolean>(false);
  const [isEditingCamera, setIsEditingCamera] = useState<boolean>(false);
  const [editingCamera, setEditingCamera] = useState<Camera | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState<boolean>(false);
  const [cameraToDelete, setCameraToDelete] = useState<Camera | null>(null);

  useEffect(() => {
    loadCameras();
  }, []);

  const loadCameras = () => {
    const allCameras = CameraService.getAllCameras();
    setCameras(allCameras);
    setSelectedCameras([]);
  };

  const handleSelectAllChange = (checked: boolean) => {
    if (checked) {
      const allIds = cameras.map((camera) => camera.id);
      setSelectedCameras(allIds);
    } else {
      setSelectedCameras([]);
    }
  };

  const handleSelectCamera = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedCameras((prev) => [...prev, id]);
    } else {
      setSelectedCameras((prev) => prev.filter((cameraId) => cameraId !== id));
    }
  };

  const handleDeleteCamera = (camera: Camera) => {
    // Set the specific camera to delete and open the dialog
    setCameraToDelete(camera);
    setDeleteDialogOpen(true);
  };

  const confirmDeleteCamera = () => {
    if (cameraToDelete) {
      // Only delete the specific camera that was selected
      CameraService.deleteCamera(cameraToDelete.id);
      toast.success(`Camera "${cameraToDelete.name}" deleted`);
      
      // Close the dialog and reset state
      setDeleteDialogOpen(false);
      setCameraToDelete(null);
      
      // Reload the camera list
      loadCameras();
      
      // Notify parent if needed
      if (onCamerasChanged) {
        onCamerasChanged();
      }
    }
  };

  const handleEditCamera = (camera: Camera) => {
    setEditingCamera(camera);
    setIsEditingCamera(true);
  };

  const handleCameraSaved = () => {
    loadCameras();
    setIsAddingCamera(false);
    setIsEditingCamera(false);
    setEditingCamera(null);
    
    if (onCamerasChanged) {
      onCamerasChanged();
    }
  };

  const filteredCameras = cameras.filter((camera) =>
    camera.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    camera.ipAddress.includes(searchTerm) ||
    camera.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const areAllSelected =
    filteredCameras.length > 0 &&
    filteredCameras.every((camera) => selectedCameras.includes(camera.id));

  if (isAddingCamera) {
    return <CameraForm onSaved={handleCameraSaved} onCancel={() => setIsAddingCamera(false)} />;
  }

  if (isEditingCamera && editingCamera) {
    return (
      <CameraForm
        camera={editingCamera}
        onSaved={handleCameraSaved}
        onCancel={() => {
          setIsEditingCamera(false);
          setEditingCamera(null);
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div className="relative w-full sm:max-w-xs">
          <Input
            placeholder="Search cameras..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
          <Video className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
        </div>
        
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => loadCameras()}>
            Refresh
          </Button>
          <Button onClick={() => setIsAddingCamera(true)}>
            <Plus className="mr-1 h-4 w-4" />
            Add Camera
          </Button>
        </div>
      </div>

      <div className="border rounded-md">
        <ScrollArea className="h-[400px]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">
                  <Checkbox
                    checked={areAllSelected}
                    onCheckedChange={handleSelectAllChange}
                    aria-label="Select all cameras"
                  />
                </TableHead>
                <TableHead>Name</TableHead>
                <TableHead>IP Address</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredCameras.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-32 text-center">
                    <div className="flex flex-col items-center justify-center text-muted-foreground">
                      <AlertCircle className="h-8 w-8 mb-2" />
                      <p>No cameras found</p>
                      {searchTerm && (
                        <p className="text-sm">
                          Try adjusting your search query
                        </p>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filteredCameras.map((camera) => (
                  <TableRow key={camera.id}>
                    <TableCell>
                      <Checkbox
                        checked={selectedCameras.includes(camera.id)}
                        onCheckedChange={(checked) =>
                          handleSelectCamera(camera.id, !!checked)
                        }
                        aria-label={`Select ${camera.name}`}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{camera.name}</div>
                      {camera.description && (
                        <div className="text-xs text-muted-foreground">
                          {camera.description}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {camera.ipAddress}:{camera.port}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={camera.isOnline ? "default" : "outline"}
                        className={camera.isOnline ? "bg-green-500" : "text-red-500 border-red-500"}
                      >
                        {camera.isOnline ? "Online" : "Offline"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEditCamera(camera)}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleDeleteCamera(camera)}
                        >
                          <Trash className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </ScrollArea>
      </div>
      
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Deletion</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {cameraToDelete ? `camera "${cameraToDelete.name}"` : 'this camera'}? 
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setCameraToDelete(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteCamera} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default CameraList;
