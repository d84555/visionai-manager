
import React, { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardFooter,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Upload, Info, AlertCircle } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import SettingsService from '@/services/SettingsService';
import StorageServiceFactory from '@/services/storage/StorageServiceFactory';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Check, Layers } from 'lucide-react';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

interface ModelSelectorProps {
  onModelSelected?: (modelName: string, modelPath: string) => void;
}

const ModelSelector: React.FC<ModelSelectorProps> = ({ onModelSelected }) => {
  const [selectedModel, setSelectedModel] = useState<string>('yolov11');
  const [autoApply, setAutoApply] = useState<boolean>(true);
  const [activeModel, setActiveModel] = useState<{name: string; path: string} | undefined>(undefined);
  const [availableModels, setAvailableModels] = useState<{id: string, name: string, path: string, description: string}[]>([]);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [modelName, setModelName] = useState<string>('');
  const [modelType, setModelType] = useState<string>('object-detection');
  const [modelFile, setModelFile] = useState<File | null>(null);
  const [storageMode, setStorageMode] = useState<string>(StorageServiceFactory.getMode());
  
  useEffect(() => {
    loadModels();
    loadActiveModel();
    loadAutoApplySetting();
  }, []);
  
  const loadModels = async () => {
    try {
      const storageService = StorageServiceFactory.getService();
      const customModels = await storageService.listModels();
      
      const formattedCustomModels = customModels.map(model => ({
        id: model.id,
        name: model.name,
        path: model.path,
        description: `Custom model (${model.fileSize || 'unknown size'})`
      }));
      
      setAvailableModels(formattedCustomModels);
    } catch (error) {
      console.error('Failed to load custom models:', error);
      setAvailableModels([]);
      toast.error('Failed to load models from the Edge Computing node');
    }
  };
  
  const loadActiveModel = async () => {
    try {
      const storageService = StorageServiceFactory.getService();
      const model = await storageService.getActiveModel();
      
      if (model) {
        setActiveModel(model);
        const modelId = availableModels.find(m => m.path === model.path)?.id || 'yolov11';
        setSelectedModel(modelId);
      }
    } catch (error) {
      console.error('Failed to load active model:', error);
    }
  };
  
  const loadAutoApplySetting = () => {
    const modelSettings = SettingsService.getSettings('model');
    setAutoApply(modelSettings.autoApplyModel !== false);
  };
  
  useEffect(() => {
    const modelSettings = SettingsService.getSettings('model');
    SettingsService.updateSettings('model', {
      ...modelSettings,
      autoApplyModel: autoApply
    });
  }, [autoApply]);
  
  const handleModelChange = (modelId: string) => {
    setSelectedModel(modelId);
    
    if (autoApply) {
      handleApplyModelById(modelId);
    }
  };
  
  const handleApplyModelById = (modelId: string) => {
    const model = availableModels.find(m => m.id === modelId);
    
    if (model) {
      const isOnnxFormat = model.path.toLowerCase().endsWith('.onnx');
      const isPytorchFormat = model.path.toLowerCase().endsWith('.pt') || model.path.toLowerCase().endsWith('.pth');
      
      if (isPytorchFormat) {
        toast.info(`Using PyTorch model: ${model.name}`, {
          description: "PyTorch model support is in beta. For best performance, consider converting to ONNX format."
        });
      } else if (!isOnnxFormat) {
        toast.warning(`Model format warning: ${model.name}`, {
          description: "For optimal performance, models should be in ONNX format. Non-ONNX models will use simulation mode."
        });
      }
    
      const storageService = StorageServiceFactory.getService();
      storageService.setActiveModel(model.name, model.path)
        .then(() => {
          setActiveModel({ name: model.name, path: model.path });
          
          if (onModelSelected) {
            onModelSelected(model.name, model.path);
          }
          
          toast.success(`Applied model: ${model.name}`, {
            description: autoApply ? "This model will be applied to all cameras" : "This model will be used as the default"
          });
          
          if (autoApply) {
            localStorage.removeItem('camera-models');
          }
        })
        .catch(error => {
          console.error('Failed to set active model:', error);
          toast.error('Failed to apply model to Edge Computing node');
        });
    }
  };
  
  const handleApplyModel = (event?: React.MouseEvent) => {
    handleApplyModelById(selectedModel);
  };
  
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const isPyTorch = file.name.toLowerCase().endsWith('.pt') || 
                       file.name.toLowerCase().endsWith('.pth');
      const isOnnx = file.name.toLowerCase().endsWith('.onnx');
      
      if (!isOnnx && !isPyTorch) {
        toast.warning("Unsupported model format", {
          description: "Please upload either ONNX (.onnx) or PyTorch (.pt/.pth) models"
        });
        return;
      }
      
      if (isPyTorch) {
        toast.info("PyTorch model detected", {
          description: "Note: PyTorch models are currently in beta support. For best performance, consider converting to ONNX format."
        });
      }
      
      setModelFile(file);
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
    
    const isPyTorch = modelFile.name.toLowerCase().endsWith('.pt') || 
                     modelFile.name.toLowerCase().endsWith('.pth');
    
    setIsUploading(true);
    
    try {
      const storageService = StorageServiceFactory.getService();
      const uploadResult = await storageService.uploadModel(modelFile, modelName);
      
      if (isPyTorch) {
        toast.success('PyTorch Model Uploaded (Beta)', {
          description: 'Model uploaded successfully. Note that PyTorch support is in beta.'
        });
      } else {
        toast.success('Model Uploaded', {
          description: 'Model has been successfully uploaded and is ready to use.'
        });
      }
      
      setModelName('');
      setModelFile(null);
      setModelType('object-detection');
      
      loadModels();
    } catch (error) {
      console.error('Error uploading model:', error);
      toast.error('Failed to upload model', {
        description: isPyTorch 
          ? 'Error uploading PyTorch model. This feature is in beta.'
          : 'Please try again or check your connection.'
      });
    } finally {
      setIsUploading(false);
    }
  };
  
  const handleDeleteModel = async (modelId: string) => {
    try {
      const modelToDelete = availableModels.find(model => model.id === modelId);
      if (!modelToDelete || !modelToDelete.id.startsWith('custom-')) {
        toast.error('Only custom models can be deleted');
        return;
      }
      
      const storageService = StorageServiceFactory.getService();
      await storageService.deleteModel(modelId);
      
      toast.success('Model Removed', {
        description: `${modelToDelete.name} has been successfully removed from the Edge Computing node.`
      });
      
      loadModels();
      
      if (activeModel && availableModels.find(m => m.id === modelId)?.path === activeModel.path) {
        setActiveModel(undefined);
      }
    } catch (error) {
      console.error('Error deleting model:', error);
      toast.error('Failed to delete model from Edge Computing node');
    }
  };
  
  // Function to check model format
  const isOnnxFormat = (path: string): boolean => {
    return path.toLowerCase().endsWith('.onnx');
  };
  
  const isPytorchFormat = (path: string): boolean => {
    return path.toLowerCase().endsWith('.pt') || path.toLowerCase().endsWith('.pth');
  };
  
  // Get model format details
  const getModelFormatDetails = (path: string) => {
    if (isOnnxFormat(path)) {
      return {
        badge: <Badge variant="outline" className="ml-2 bg-green-100 text-green-800 text-xs">ONNX</Badge>,
        icon: null,
        class: 'border-green-500 bg-green-50/20'
      };
    } else if (isPytorchFormat(path)) {
      return {
        badge: <Badge variant="outline" className="ml-2 bg-amber-100 text-amber-800 text-xs">PyTorch (Beta)</Badge>,
        icon: <AlertCircle className="w-4 h-4 ml-1 text-amber-600" />,
        class: 'border-amber-400 bg-amber-50/20'
      };
    }
    return {
      badge: <Badge variant="outline" className="ml-2 bg-gray-100 text-gray-800 text-xs">Unknown</Badge>,
      icon: null,
      class: ''
    };
  };
  
  return (
    <Tabs defaultValue="select" className="w-full">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="select">Select AI Model</TabsTrigger>
        <TabsTrigger value="upload">Upload New Model</TabsTrigger>
      </TabsList>
      
      <TabsContent value="select">
        <Card className="border-none shadow-none pt-0">
          <CardContent className="p-0 pt-6">
            {availableModels.length > 0 ? (
              <RadioGroup
                value={selectedModel}
                onValueChange={handleModelChange}
                className="space-y-2"
              >
                {availableModels.map((model) => {
                  const formatDetails = getModelFormatDetails(model.path);
                  return (
                    <div 
                      key={model.id} 
                      className={`flex items-center space-x-2 border p-3 rounded-lg transition-colors ${
                        activeModel?.path === model.path ? 'border-avianet-red bg-avianet-red/5' : 
                        formatDetails.class
                      }`}
                    >
                      <RadioGroupItem value={model.id} id={`model-${model.id}`} />
                      <div className="grid gap-1.5 flex-1">
                        <Label htmlFor={`model-${model.id}`} className="font-medium flex items-center">
                          {model.name}
                          {activeModel?.path === model.path && (
                            <span className="ml-2 inline-flex items-center text-xs font-medium text-green-600">
                              <Check className="w-3 h-3 mr-1" /> Active
                            </span>
                          )}
                          {formatDetails.badge}
                          {formatDetails.icon}
                        </Label>
                        <p className="text-sm text-muted-foreground">
                          {model.description}
                        </p>
                      </div>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="text-red-500 hover:text-red-700 hover:bg-red-50"
                        onClick={() => handleDeleteModel(model.id)}
                      >
                        Delete
                      </Button>
                    </div>
                  );
                })}
              </RadioGroup>
            ) : (
              <div className="text-center py-8">
                <div className="flex flex-col items-center justify-center space-y-2">
                  <Layers className="w-12 h-12 text-muted-foreground/50" />
                  <h3 className="font-medium text-lg">No Models Available</h3>
                  <p className="text-sm text-muted-foreground">
                    Please upload an AI model to get started with object detection
                  </p>
                </div>
              </div>
            )}
            
            <div className="flex items-center space-x-2 mt-6">
              <input
                type="checkbox"
                id="auto-apply"
                checked={autoApply}
                onChange={(e) => setAutoApply(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300"
              />
              <Label htmlFor="auto-apply">Automatically apply to all video streams</Label>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-4 w-4 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>When enabled, this model will be applied to all video streams automatically</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </CardContent>
          <CardFooter className="flex justify-between p-0 pt-6">
            <div className="text-sm text-muted-foreground">
              {activeModel ? `Currently active: ${activeModel.name}` : "No model is currently active"}
            </div>
            <Button 
              onClick={handleApplyModel} 
              disabled={!selectedModel}
            >
              {activeModel?.path === availableModels.find(m => m.id === selectedModel)?.path
                ? "Reapply Model"
                : "Apply Model"
              }
            </Button>
          </CardFooter>
        </Card>
      </TabsContent>
      
      <TabsContent value="upload">
        <Card className="border-none shadow-none pt-0">
          <CardContent className="p-0 pt-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="model-file">Select Model File</Label>
                <Input 
                  id="model-file" 
                  type="file" 
                  accept=".onnx,.pt,.pth" 
                  onChange={handleFileChange}
                  disabled={isUploading}
                />
                <div className="flex flex-col space-y-1">
                  <p className="text-xs text-green-700 flex items-center">
                    <Check className="inline w-3 h-3 mr-1" /> <strong>Recommended:</strong> .onnx (ONNX format)
                  </p>
                  <p className="text-xs text-amber-700 flex items-center">
                    <AlertCircle className="inline w-3 h-3 mr-1" /> <strong>Beta support:</strong> .pt, .pth (PyTorch format)
                  </p>
                </div>
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
              
              {modelFile && modelFile.name.toLowerCase().endsWith('.pt') && (
                <div className="bg-amber-50 p-4 rounded-md border border-amber-200">
                  <h4 className="text-sm font-semibold text-amber-800 flex items-center mb-1">
                    <AlertCircle className="w-4 h-4 mr-1" /> 
                    PyTorch Model Format (Beta Support)
                  </h4>
                  <p className="text-sm text-amber-800">
                    PyTorch (.pt/.pth) support is currently in beta and may have limited functionality.
                    For GPU acceleration and best performance, we recommend converting to ONNX format.
                  </p>
                </div>
              )}
              
              {modelFile && modelFile.name.toLowerCase().endsWith('.onnx') && (
                <div className="bg-green-50 p-4 rounded-md border border-green-200">
                  <h4 className="text-sm font-semibold text-green-800 flex items-center mb-1">
                    <Check className="w-4 h-4 mr-1" /> 
                    ONNX Model Format (Recommended)
                  </h4>
                  <p className="text-sm text-green-800">
                    ONNX format provides optimal performance and GPU acceleration capabilities.
                    This is the recommended format for all AI models in the platform.
                  </p>
                </div>
              )}
            </div>
          </CardContent>
          <CardFooter className="flex justify-end p-0 pt-6">
            <Button 
              variant="default" 
              onClick={handleUpload} 
              disabled={isUploading || !modelFile || !modelName.trim()}
            >
              {isUploading ? (
                <>
                  <Upload className="mr-2 h-4 w-4 animate-pulse" />
                  Uploading to Edge Node...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Upload Model to Edge Node
                </>
              )}
            </Button>
          </CardFooter>
        </Card>
      </TabsContent>
    </Tabs>
  );
};

export default ModelSelector;
