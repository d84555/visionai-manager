
import React, { useState, useEffect } from 'react';
import { 
  Camera as CameraIcon, 
  Edit, 
  Trash2, 
  RefreshCw, 
  Plus,
  Wifi,
  WifiOff,
  Check,
  X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Camera } from '@/services/CameraService';
import CameraService from '@/services/CameraService';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import CameraForm from './CameraForm';
import { toast } from 'sonner';
import VideoFeed from '@/components/video/VideoFeed';
import { Card } from '@/components/ui/card';

interface CameraListProps {
  onCamerasChanged?: () => void;
}

const CameraList: React.FC<CameraListProps> = ({ onCamerasChanged }) => {
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedCamera, setSelectedCamera] = useState<Camera | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [cameraToDelete, setCameraToDelete] = useState<Camera | null>(null);
  const [previewCamera, setPreviewCamera] = useState<Camera | null>(null);
  
  useEffect(() => {
    loadCameras();
  }, []);
  
  const loadCameras = () => {
    const loadedCameras = CameraService.getAllCameras();
    setCameras(loadedCameras);
  };
  
  const handleRefreshStatuses = async () => {
    setIsRefreshing(true);
    try {
      await CameraService.refreshAllCameraStatuses();
      loadCameras();
    } catch (error) {
      toast.error('Failed to refresh camera statuses');
    } finally {
      setIsRefreshing(false);
    }
  };
  
  const handleAddCamera = () => {
    setSelectedCamera(null);
    setIsFormOpen(true);
  };
  
  const handleEditCamera = (camera: Camera) => {
    setSelectedCamera(camera);
    setIsFormOpen(true);
  };
  
  const handleDeleteCamera = (camera: Camera) => {
    setCameraToDelete(camera);
    setIsDeleteDialogOpen(true);
  };
  
  const confirmDelete = () => {
    if (cameraToDelete) {
      CameraService.deleteCamera(cameraToDelete.id);
      loadCameras();
      setIsDeleteDialogOpen(false);
      setCameraToDelete(null);
      if (onCamerasChanged) {
        onCamerasChanged();
      }
    }
  };
  
  const handleSaveCamera = (camera: Camera) => {
    setIsFormOpen(false);
    loadCameras();
    if (onCamerasChanged) {
      onCamerasChanged();
    }
  };
  
  const handlePreviewCamera = (camera: Camera) => {
    setPreviewCamera(camera);
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-medium">Cameras</h3>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleRefreshStatuses}
            disabled={isRefreshing}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh Status
          </Button>
          <Button size="sm" onClick={handleAddCamera}>
            <Plus className="mr-2 h-4 w-4" />
            Add Camera
          </Button>
        </div>
      </div>

      {cameras.length > 0 ? (
        <div className="border rounded-md overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="hidden sm:table-cell">Address</TableHead>
                <TableHead className="hidden md:table-cell">Protocol</TableHead>
                <TableHead className="hidden lg:table-cell">Brand</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cameras.map((camera) => (
                <TableRow key={camera.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center">
                      <CameraIcon className="mr-2 h-4 w-4 text-avianet-red" />
                      {camera.name}
                    </div>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    {camera.ipAddress}:{camera.port}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <Badge variant="outline">{camera.protocol}</Badge>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    {camera.brand}
                  </TableCell>
                  <TableCell>
                    {camera.isOnline ? (
                      <Badge className="bg-green-500">
                        <Wifi className="mr-1 h-3 w-3" />
                        Online
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-red-500 border-red-500">
                        <WifiOff className="mr-1 h-3 w-3" />
                        Offline
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button 
                        variant="ghost" 
                        size="icon"
                        onClick={() => handlePreviewCamera(camera)}
                      >
                        <CameraIcon className="h-4 w-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon"
                        onClick={() => handleEditCamera(camera)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => handleDeleteCamera(camera)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center border rounded-md p-8 text-center">
          <CameraIcon className="h-12 w-12 text-gray-400 mb-4" />
          <h3 className="text-lg font-medium mb-2">No Cameras Added</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Add an IP camera to start streaming video
          </p>
          <Button onClick={handleAddCamera}>
            <Plus className="mr-2 h-4 w-4" />
            Add Your First Camera
          </Button>
        </div>
      )}

      {/* Camera Add/Edit Dialog */}
      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {selectedCamera ? 'Edit Camera' : 'Add New Camera'}
            </DialogTitle>
          </DialogHeader>
          <CameraForm 
            camera={selectedCamera || undefined}
            onSave={handleSaveCamera}
            onCancel={() => setIsFormOpen(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Camera Preview Dialog */}
      <Dialog open={!!previewCamera} onOpenChange={() => setPreviewCamera(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center">
              <CameraIcon className="mr-2 h-5 w-5 text-avianet-red" />
              {previewCamera?.name}
            </DialogTitle>
          </DialogHeader>
          {previewCamera && (
            <div className="space-y-4">
              <div className="aspect-video">
                <VideoFeed 
                  initialVideoUrl={CameraService.getPlayableStreamUrl(previewCamera)}
                  autoStart={true}
                  showControls={false}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Address</p>
                  <p className="text-sm font-medium">
                    {previewCamera.ipAddress}:{previewCamera.port}
                  </p>
                </div>
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Protocol</p>
                  <p className="text-sm font-medium">
                    {previewCamera.protocol}
                  </p>
                </div>
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Brand & Stream</p>
                  <p className="text-sm font-medium">
                    {previewCamera.brand} ({previewCamera.streamType})
                  </p>
                </div>
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Status</p>
                  <div>
                    {previewCamera.isOnline ? (
                      <Badge className="bg-green-500">
                        <Wifi className="mr-1 h-3 w-3" />
                        Online
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-red-500 border-red-500">
                        <WifiOff className="mr-1 h-3 w-3" />
                        Offline
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
              {previewCamera.customStreamUrl && (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Custom URL</p>
                  <p className="text-sm font-medium break-all">
                    {previewCamera.customStreamUrl}
                  </p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete camera "{cameraToDelete?.name}"?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the camera
              configuration and any associated data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default CameraList;
