
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
import { Brain, Upload, Trash2, Camera } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import SettingsService from '@/services/SettingsService';

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
  
  // Load saved models on component mount
  useEffect(() => {
    const customModels = SettingsService.getCustomModels();
    const formattedModels = customModels.map(model => ({
      id: model.id,
      name: model.name,
      type: 'Object Detection', // Default type for existing models
      size: model.size || 'Unknown size',
      cameras: model.cameras || ['All Cameras'],
      uploaded: new Date(model.uploadedAt)
    }));
    
    // Also load any mock models that might be in state
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
    
    // Combine saved models and mock models (avoiding duplicates by ID)
    const allModels = [...formattedModels];
    if (allModels.length === 0) {
      allModels.push(...mockModels);
    }
    
    setUploadedModels(allModels);
  }, []);
  
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setModelFile(e.target.files[0]);
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
    
    setIsUploading(true);
    
    try {
      // Calculate file size in MB
      const fileSizeMB = (modelFile.size / (1024 * 1024)).toFixed(1);
      
      // Upload the model using SettingsService
      const uploadResult = await SettingsService.uploadCustomModel(modelFile, modelName);
      
      const newModel: AIModel = {
        id: `custom-${Date.now()}`,
        name: modelName,
        type: modelType === 'object-detection' ? 'Object Detection' : 
              modelType === 'face-recognition' ? 'Face Recognition' : 
              modelType === 'anomaly-detection' ? 'Anomaly Detection' : 'Behavior Analysis',
        size: `${fileSizeMB} MB`,
        cameras: ['All Cameras'],
        uploaded: new Date()
      };
      
      // Update state with the new model
      setUploadedModels(prev => [...prev, newModel]);
      
      // Reset form
      setModelName('');
      setModelFile(null);
      setModelType('object-detection');
      
      // Success notification
      toast.success('AI Model Uploaded', {
        description: `${newModel.name} has been successfully uploaded and is ready to use.`
      });
    } catch (error) {
      console.error('Error uploading model:', error);
      toast.error('Failed to upload model', {
        description: 'Please try again or contact support if the issue persists.'
      });
    } finally {
      setIsUploading(false);
    }
  };
  
  const handleDelete = (modelId: string) => {
    // Find the model to delete
    const modelToDelete = uploadedModels.find(model => model.id === modelId);
    if (!modelToDelete) return;
    
    // Remove from state
    setUploadedModels(uploadedModels.filter(model => model.id !== modelId));
    
    // Remove from localStorage
    const customModels = SettingsService.getCustomModels().filter(model => model.id !== modelId);
    localStorage.setItem('custom-ai-models', JSON.stringify(customModels));
    
    toast.success('Model Removed', {
      description: `${modelToDelete.name} has been successfully removed.`
    });
  };
  
  const handleAssignCamera = (modelId: string, camera: string) => {
    setUploadedModels(uploadedModels.map(model => {
      if (model.id === modelId) {
        // If "All Cameras" is selected, clear other selections
        if (camera === 'All Cameras') {
          return { ...model, cameras: ['All Cameras'] };
        }
        
        // If this model already has "All Cameras", remove it when selecting a specific camera
        let updatedCameras = model.cameras.includes('All Cameras') 
          ? [camera] 
          : [...model.cameras];
        
        // Toggle camera: add if not already in the list, remove if it is
        if (!updatedCameras.includes(camera)) {
          updatedCameras.push(camera);
        } else {
          updatedCameras = updatedCameras.filter(c => c !== camera);
          // If no cameras left, assign to all cameras
          if (updatedCameras.length === 0) {
            updatedCameras = ['All Cameras'];
          }
        }
        
        const updatedModel = { ...model, cameras: updatedCameras };
        
        // Update camera assignments in localStorage
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
  
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Upload className="mr-2 text-avianet-red" size={18} />
            Upload AI Model
          </CardTitle>
          <CardDescription>
            Upload new AI models to enhance detection capabilities
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="model-file">Select Model File</Label>
              <Input 
                id="model-file" 
                type="file" 
                accept=".pt,.onnx,.tflite,.pb" 
                onChange={handleFileChange}
                disabled={isUploading}
              />
              <p className="text-xs text-muted-foreground">
                Supported formats: ONNX, TFLite, PyTorch, TensorFlow
              </p>
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
          <Button variant="default" onClick={handleUpload} disabled={isUploading || !modelFile || !modelName.trim()}>
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
