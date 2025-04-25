
import { useState, useEffect } from 'react';
import { Camera } from '@/services/CameraService';
import CameraService from '@/services/CameraService';
import SettingsService from '@/services/SettingsService';
import { toast } from 'sonner';

export const useCameraGrid = () => {
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeModel, setActiveModel] = useState<{ name: string; path: string } | undefined>(undefined);
  const [availableModels, setAvailableModels] = useState<{id: string, name: string, path: string}[]>([]);
  const [camerasWithCustomModel, setCamerasWithCustomModel] = useState<Record<string, { name: string; path: string }>>({});
  const [dragOverPosition, setDragOverPosition] = useState<string | null>(null);
  const [playingStreams, setPlayingStreams] = useState<Record<string, boolean>>({});
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenCamera, setFullscreenCamera] = useState<string | null>(null);
  const [cameraStreamTypes, setCameraStreamTypes] = useState<Record<string, 'main' | 'sub'>>({});

  useEffect(() => {
    loadCameras();
    loadActiveModel();
    loadModels();
    loadCameraModels();

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  const handleFullscreenChange = () => {
    if (!document.fullscreenElement) {
      setIsFullscreen(false);
      setFullscreenCamera(null);
    } else {
      setIsFullscreen(true);
    }
  };

  const loadCameras = () => {
    const loadedCameras = CameraService.getAllCameras();
    setCameras(loadedCameras);
  };

  const loadActiveModel = () => {
    const model = SettingsService.getActiveModel();
    setActiveModel(model || undefined);
  };

  const loadModels = () => {
    const modelsList = [
      { id: 'yolov11-n', name: 'YOLOv11 Nano', path: '/models/yolov11-n.onnx' },
      { id: 'yolov11-s', name: 'YOLOv11 Small', path: '/models/yolov11-s.onnx' },
      { id: 'yolov11', name: 'YOLOv11 Base', path: '/models/yolov11.onnx' },
      { id: 'yolov11-m', name: 'YOLOv11 Medium', path: '/models/yolov11-m.onnx' },
      { id: 'yolov11-l', name: 'YOLOv11 Large', path: '/models/yolov11-l.onnx' }
    ];
    
    const customModels = SettingsService.getCustomModels().map(model => ({
      id: model.id,
      name: model.name,
      path: model.path
    }));
    
    setAvailableModels([...modelsList, ...customModels]);
  };

  const loadCameraModels = () => {
    const savedCameraModels = localStorage.getItem('camera-models');
    if (savedCameraModels) {
      setCamerasWithCustomModel(JSON.parse(savedCameraModels));
    }
  };

  const saveCameraModels = (newCameraModels: Record<string, { name: string; path: string }>) => {
    localStorage.setItem('camera-models', JSON.stringify(newCameraModels));
    setCamerasWithCustomModel(newCameraModels);
  };

  const handleRefreshStatuses = async () => {
    setIsRefreshing(true);
    try {
      await CameraService.refreshAllCameraStatuses();
      loadCameras();
    } catch (error) {
      console.error('Failed to refresh camera statuses:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleApplyModelToCamera = (cameraId: string, modelId: string | null) => {
    const newCameraModels = { ...camerasWithCustomModel };
    
    if (modelId === null) {
      delete newCameraModels[cameraId];
      saveCameraModels(newCameraModels);
      toast.success("Camera will use global AI model");
      return;
    }
    
    const model = availableModels.find(m => m.id === modelId);
    if (model) {
      newCameraModels[cameraId] = { name: model.name, path: model.path };
      saveCameraModels(newCameraModels);
      toast.success(`Applied ${model.name} to camera`);
    }
  };

  const handleApplyModelToAll = (modelId: string | null) => {
    if (modelId === null) {
      saveCameraModels({});
      toast.success("All cameras will use global AI model");
      return;
    }
    
    const model = availableModels.find(m => m.id === modelId);
    if (model) {
      const newCameraModels: Record<string, { name: string; path: string }> = {};
      cameras.forEach(camera => {
        newCameraModels[camera.id] = { name: model.name, path: model.path };
      });
      saveCameraModels(newCameraModels);
      toast.success(`Applied ${model.name} to all cameras`);
    }
  };

  const getCameraModel = (cameraId: string) => {
    if (camerasWithCustomModel[cameraId]) {
      return camerasWithCustomModel[cameraId];
    }
    return activeModel;
  };

  return {
    cameras,
    isRefreshing,
    activeModel,
    availableModels,
    camerasWithCustomModel,
    dragOverPosition,
    playingStreams,
    isFullscreen,
    fullscreenCamera,
    cameraStreamTypes,
    setDragOverPosition,
    setPlayingStreams,
    setIsFullscreen,
    setFullscreenCamera,
    setCameraStreamTypes,
    handleRefreshStatuses,
    handleApplyModelToCamera,
    handleApplyModelToAll,
    getCameraModel
  };
};
