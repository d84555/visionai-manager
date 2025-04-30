
import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardFooter, 
  CardHeader, 
  CardTitle 
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { Brain, Upload, Trash2, Camera, AlertCircle, Info, RefreshCw, Server, CloudOff } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import SettingsService, { ModelInfo } from '@/services/SettingsService';
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip';
import StorageServiceFactory from '@/services/storage/StorageServiceFactory';

interface AIModel {
  id: string;
  name: string;
  type: string;
  size: string;
  cameras: string[];
  uploaded: Date;
}

const AIModelUpload: React.FC = () => {
  const [uploadedModels, setUploadedModels] = useState<AIModel[]>([]);
  const [modelName, setModelName] = useState('');
  const [modelType, setModelType] = useState('object-detection');
  const [modelFile, setModelFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [assignTarget, setAssignTarget] = useState<string | null>(null);
  const [isPyTorch, setIsPyTorch] = useState(false);
  const [forceAllowPyTorch, setForceAllowPyTorch] = useState(false);
  const [apiAvailable, setApiAvailable] = useState<boolean>(false);
  const [isCheckingApi, setIsCheckingApi] = useState<boolean>(false);
  
  useEffect(() => {
    loadModels();
    checkApiAvailability();
  }, []);
  
  const checkApiAvailability = async () => {
    setIsCheckingApi(true);
    try {
      const response = await fetch('/api/health');
      setApiAvailable(response.ok);
    } catch (error) {
      console.warn('API health check failed:', error);
      setApiAvailable(false);
    } finally {
      setIsCheckingApi(false);
    }
  };
  
  const loadModels = () => {
    const customModels = SettingsService.getCustomModels();
    const formattedModels = customModels.map(model => ({
      id: model.id,
      name: model.name,
      type: 'Object Detection', // Default type for existing models
      size: model.size || 'Unknown size',
      cameras: model.cameras || ['All Cameras'],
      uploaded: new Date(model.uploadedAt || new Date())
    }));
    
    const mockModels = [
      {
        id: 'model-1',
        name: 'YOLOv11',
        type: 'Object Detection',
        size: '23.4 MB',
        cameras: ['All Cameras'],
        uploaded: new Date('2025-01-15')
      },
      {
        id: 'model-2',
        name: 'Face Recognition Pro',
        type: 'Face Recognition',
        size: '42.1 MB',
        cameras: ['Front Entrance', 'Reception'],
        uploaded: new Date('2025-02-20')
      }
    ];
    
    const allModels = [...formattedModels];
    if (allModels.length === 0) {
      allModels.push(...mockModels);
    }
    
    setUploadedModels(allModels);
  };
  
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setModelFile(file);
      
      // Check if the file is a PyTorch model
      const isPyTorchFile = file.name.endsWith('.pt') || file.name.endsWith('.pth');
      setIsPyTorch(isPyTorchFile);
      setForceAllowPyTorch(false); // Reset force flag when file changes
    }
  };
  
  const handleUpload = async () => {
    if (!modelFile) {
      toast.error('Please select a model file to upload');
      return;
    }
    
    if (!modelName.trim()) {
      toast.error('Please enter a name for the model');
      return;
    }
    
    // Check if PyTorch model without force flag
    if (isPyTorch && !forceAllowPyTorch) {
      toast.error('PyTorch models require special handling', {
        description: 'Click "Enable PyTorch Support" button to continue with upload anyway.',
        duration: 5000
      });
      return;
    }
    
    setIsUploading(true);
    
    try {
      const fileSizeMB = (modelFile.size / (1024 * 1024)).toFixed(1);
      
      try {
        // Add extra params for PyTorch models
        const uploadOptions = isPyTorch ? { enablePyTorchSupport: true } : undefined;
        
        let uploadResult;
        
        // Try API upload first if API is available
        if (apiAvailable) {
          try {
            const storageService = StorageServiceFactory.getService();
            uploadResult = await storageService.uploadModel(modelFile, modelName, uploadOptions);
            
            toast.success('AI Model Uploaded via API', {
              description: `${modelName} has been successfully uploaded to the Edge Computing Node.`,
            });
          } catch (apiError) {
            console.warn('API upload failed, falling back to simulated upload:', apiError);
            // Fall back to local simulated upload - FIX HERE: The uploadCustomModel method only accepts 2 arguments
            uploadResult = await SettingsService.uploadCustomModel(modelFile, modelName);
            
            toast.success('AI Model Uploaded (Simulation)', {
              description: `${modelName} has been simulated as uploaded. (API unavailable)`,
            });
          }
        } else {
          // API not available, use simulated storage - FIX HERE: The uploadCustomModel method only accepts 2 arguments
          uploadResult = await SettingsService.uploadCustomModel(modelFile, modelName);
          
          toast.success('AI Model Uploaded (Simulation)', {
            description: `${modelName} has been simulated as uploaded. (API unavailable)`,
          });
        }
        
        const newModel: AIModel = {
          id: uploadResult.id || `custom-${Date.now()}`,
          name: modelName,
          type: modelType === 'object-detection' ? 'Object Detection' : 
                modelType === 'face-recognition' ? 'Face Recognition' : 
                modelType === 'anomaly-detection' ? 'Anomaly Detection' : 'Behavior Analysis',
          size: `${fileSizeMB} MB`,
          cameras: ['All Cameras'],
          uploaded: new Date()
        };
        
        setUploadedModels(prev => [...prev, newModel]);
        
        setModelName('');
        setModelFile(null);
        setModelType('object-detection');
        setForceAllowPyTorch(false);
      } catch (error: any) {
        console.error('Error uploading model:', error);
        
        if (isPyTorch) {
          toast.error('Failed to upload PyTorch model', {
            description: 'The PyTorch model could not be processed. Consider converting it to ONNX format for better compatibility.',
            duration: 5000
          });
        } else {
          toast.error('Failed to upload model', {
            description: error.message || 'Please try again or contact support if the issue persists.'
          });
        }
      }
    } catch (error) {
      console.error('Error in upload process:', error);
      toast.error('Failed to upload model', {
        description: 'Please try again or contact support if the issue persists.'
      });
    } finally {
      setIsUploading(false);
    }
  };
  
  const handleDelete = (modelId: string) => {
    const modelToDelete = uploadedModels.find(model => model.id === modelId);
    if (!modelToDelete) return;
    
    try {
      // Try to delete the model using SettingsService
      const deleted = SettingsService.deleteCustomModel(modelId);
      
      if (!deleted) {
        toast.error('Failed to delete model', {
          description: 'This model cannot be deleted or is in use by the system.'
        });
        return;
      }
      
      setUploadedModels(uploadedModels.filter(model => model.id !== modelId));
      
      toast.success('Model Removed', {
        description: `${modelToDelete.name} has been successfully removed.`
      });
    } catch (error) {
      console.error('Error deleting model:', error);
      toast.error('Failed to delete model', {
        description: 'An error occurred while trying to delete the model.'
      });
    }
  };
  
  const handleAssignCamera = (modelId: string, camera: string) => {
    setUploadedModels(uploadedModels.map(model => {
      if (model.id === modelId) {
        if (camera === 'All Cameras') {
          return { ...model, cameras: ['All Cameras'] };
        }
        
        let updatedCameras = model.cameras.includes('All Cameras') 
          ? [camera] 
          : [...model.cameras];
        
        if (!updatedCameras.includes(camera)) {
          updatedCameras.push(camera);
        } else {
          updatedCameras = updatedCameras.filter(c => c !== camera);
          if (updatedCameras.length === 0) {
            updatedCameras = ['All Cameras'];
          }
        }
        
        const updatedModel = { ...model, cameras: updatedCameras };
        
        const customModels = SettingsService.getCustomModels();
        const modelIndex = customModels.findIndex(m => m.id === modelId);
        if (modelIndex >= 0) {
          customModels[modelIndex].cameras = updatedCameras;
          localStorage.setItem('custom-ai-models', JSON.stringify(customModels));
        }
        
        return updatedModel;
      }
      return model;
    }));
    
    toast.success('Camera Assignment Updated', {
      description: `Model assignment has been updated successfully.`
    });
    
    setAssignTarget(null);
  };
  
  const availableCameras = [
    'All Cameras',
    'Front Entrance',
    'Parking Lot',
    'Warehouse',
    'Office Area',
    'Side Entrance',
    'Loading Dock',
    'Reception'
  ];
  
  const enablePyTorchSupport = () => {
    setForceAllowPyTorch(true);
    toast.info('PyTorch support enabled for this upload', {
      description: 'You can now upload the PyTorch model. Note that functionality may be limited.',
    });
  };
  
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center">
              <Upload className="mr-2 text-avianet-red" size={18} />
              Upload AI Model
            </div>
            {!apiAvailable && (
              <Badge variant="outline" className="flex items-center gap-1 bg-amber-50 text-amber-800">
                <CloudOff className="h-3.5 w-3.5" /> 
                {isCheckingApi ? 'Checking API...' : 'API Unavailable - Using Browser Storage'}
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            Upload new AI models to enhance detection capabilities
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {!apiAvailable && (
              <div className="flex flex-col gap-2">
                <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-md">
                  <AlertCircle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-amber-800">
                    <p className="font-medium">API Unavailable</p>
                    <p>The Edge Computing API is unavailable. Models will be stored locally in your browser. 
                    Real deployment would require a running Edge Computing node.</p>
                    <div className="mt-2">
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={checkApiAvailability}
                        className="flex items-center gap-1"
                        disabled={isCheckingApi}
                      >
                        <RefreshCw className={`h-3.5 w-3.5 ${isCheckingApi ? 'animate-spin' : ''}`} />
                        Retry API Connection
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            <div className="space-y-2">
              <Label htmlFor="model-file">Select Model File</Label>
              <Input 
                id="model-file" 
                type="file" 
                accept=".pt,.onnx,.tflite,.pb,.pth" 
                onChange={handleFileChange}
                disabled={isUploading}
              />
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  Supported formats: ONNX (recommended), TFLite, PyTorch (beta), TensorFlow
                </p>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                        <Info className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent className="w-80">
                      <p className="text-sm">
                        <strong>ONNX format</strong> is recommended for best compatibility and performance. 
                        PyTorch models may have limited functionality.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              {isPyTorch && (
                <div className="mt-2 flex flex-col gap-2">
                  <div className="flex items-start gap-2 p-2 bg-amber-50 border border-amber-200 rounded-md">
                    <AlertCircle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
                    <div className="text-xs text-amber-800">
                      <p className="font-medium">PyTorch model detected</p>
                      <p>PyTorch model support is in beta. For best results, consider converting your model to ONNX format.</p>
                    </div>
                  </div>
                  {!forceAllowPyTorch && (
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={enablePyTorchSupport}
                      className="w-full"
                    >
                      Enable PyTorch Support
                    </Button>
                  )}
                </div>
              )}
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="model-name">Model Name</Label>
                <Input 
                  id="model-name" 
                  placeholder="e.g., YOLOv11 Custom" 
                  value={modelName}
                  onChange={(e) => setModelName(e.target.value)}
                  disabled={isUploading}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="model-type">Model Type</Label>
                <Select 
                  defaultValue="object-detection"
                  value={modelType}
                  onValueChange={setModelType}
                  disabled={isUploading}
                >
                  <SelectTrigger id="model-type">
                    <SelectValue placeholder="Select model type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="object-detection">Object Detection</SelectItem>
                    <SelectItem value="face-recognition">Face Recognition</SelectItem>
                    <SelectItem value="anomaly-detection">Anomaly Detection</SelectItem>
                    <SelectItem value="behavior-analysis">Behavior Analysis</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex justify-end">
          <Button 
            variant="default" 
            onClick={handleUpload} 
            disabled={isUploading || !modelFile || !modelName.trim() || (isPyTorch && !forceAllowPyTorch)}
          >
            {isUploading ? (
              <>
                <Upload className="mr-2 h-4 w-4 animate-pulse" />
                Uploading...
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                Upload Model
              </>
            )}
          </Button>
        </CardFooter>
      </Card>
      
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Brain className="mr-2 text-avianet-red" size={18} />
            Available AI Models
          </CardTitle>
          <CardDescription>
            Manage uploaded models and their camera assignments
          </CardDescription>
        </CardHeader>
        <CardContent>
          {uploadedModels.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No AI models have been uploaded yet
            </div>
          ) : (
            <div className="space-y-4">
              {uploadedModels.map((model) => (
                <div key={model.id} className="border rounded-md p-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-medium">{model.name}</h3>
                      <div className="flex flex-wrap gap-2 mt-1">
                        <Badge variant="outline" className="bg-secondary/50">
                          {model.type}
                        </Badge>
                        <Badge variant="outline" className="bg-secondary/50">
                          {model.size}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">
                        Uploaded: {model.uploaded.toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex space-x-2">
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => setAssignTarget(model.id)}
                      >
                        <Camera className="h-4 w-4 mr-2" />
                        Assign
                      </Button>
                      <Button 
                        variant="destructive" 
                        size="sm"
                        onClick={() => handleDelete(model.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  
                  {assignTarget === model.id && (
                    <div className="mt-4 border-t pt-4">
                      <Label className="mb-2 block">Assign to Cameras:</Label>
                      <div className="flex flex-wrap gap-2">
                        {availableCameras.map((camera) => (
                          <Badge 
                            key={camera} 
                            variant={model.cameras.includes(camera) ? "default" : "outline"}
                            className="cursor-pointer"
                            onClick={() => handleAssignCamera(model.id, camera)}
                          >
                            {camera}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  <div className="mt-3">
                    <Label className="text-xs text-muted-foreground">Applied to:</Label>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {model.cameras.map((camera) => (
                        <Badge key={camera} variant="secondary" className="text-xs">
                          {camera}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AIModelUpload;
