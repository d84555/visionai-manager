
import React from 'react';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useEffect, useState } from 'react';
import StorageServiceFactory from '@/services/storage/StorageServiceFactory';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, Zap } from 'lucide-react';

interface ModelSelectorProps {
  selectedModel: { name: string; path: string } | null;
  availableModels: { id: string; name: string; path: string }[];
  onModelChange: (modelId: string) => void;
}

export const ModelSelector: React.FC<ModelSelectorProps> = ({
  selectedModel,
  availableModels,
  onModelChange,
}) => {
  const [models, setModels] = useState<{ id: string; name: string; path: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadModels = async () => {
      setIsLoading(true);
      try {
        // Temporarily switch to simulated storage if API fails
        let storageService = StorageServiceFactory.getService();
        let customModels;
        
        try {
          customModels = await storageService.listModels();
        } catch (error) {
          console.warn('API storage failed, falling back to simulated storage');
          StorageServiceFactory.setMode('simulated');
          storageService = StorageServiceFactory.getService();
          customModels = await storageService.listModels();
        }
        
        // Make sure to preserve the exact file extensions from the model paths
        const formattedCustomModels = customModels.map(model => ({
          id: model.id,
          name: model.name,
          path: model.path, // Keep original path with extension
        }));
        
        console.log('Loaded models:', formattedCustomModels);
        setModels(formattedCustomModels);
      } catch (error) {
        console.error('Failed to load custom models:', error);
        toast.error('Failed to load models from the Edge Computing node');
      } finally {
        setIsLoading(false);
      }
    };

    loadModels();
  }, []);

  // Use the fetched models if available, otherwise fall back to the provided availableModels
  const displayModels = models.length > 0 ? models : availableModels;

  // Function to check if a model is in ONNX format based on file extension
  const isOnnxFormat = (path: string): boolean => {
    return path.toLowerCase().endsWith('.onnx');
  };
  
  // Function to check if a model is in PyTorch format based on file extension
  const isPytorchFormat = (path: string): boolean => {
    return path.toLowerCase().endsWith('.pt') || path.toLowerCase().endsWith('.pth');
  };
  
  // Get model format badge
  const getModelFormatBadge = (path: string) => {
    if (isOnnxFormat(path)) {
      return (
        <Badge variant="outline" className="ml-2 bg-green-100 text-green-800 text-xs">
          ONNX
        </Badge>
      );
    } else if (isPytorchFormat(path)) {
      return (
        <Badge variant="outline" className="ml-2 bg-amber-100 text-amber-800 text-xs flex items-center gap-1">
          <Zap size={12} />
          PyTorch
        </Badge>
      );
    }
    return null;
  };

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="model-selector">AI Model for Object Detection</Label>
      <Select 
        onValueChange={onModelChange}
        value={selectedModel ? displayModels.find(m => m.name === selectedModel.name)?.id || "none" : "none"}
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Select a model for detection" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">No detection (Clear model)</SelectItem>
          {isLoading ? (
            <SelectItem value="loading" disabled>Loading models...</SelectItem>
          ) : displayModels.length > 0 ? (
            displayModels.map(model => (
              <SelectItem key={model.id} value={model.id} className="flex items-center justify-between py-3">
                <div className="flex items-center space-x-2">
                  <span>{model.name}</span>
                  {getModelFormatBadge(model.path)}
                  {isPytorchFormat(model.path) && (
                    <AlertCircle className="w-3 h-3 ml-1 text-amber-600" />
                  )}
                </div>
              </SelectItem>
            ))
          ) : (
            <SelectItem value="no-models" disabled>No models available. Please upload a model.</SelectItem>
          )}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">
        {isLoading ? 'Loading available models...' : 
          displayModels.length > 0 ? 
            'Select an AI model for object detection. ONNX (.onnx) and PyTorch (.pt/.pth) models are supported.' : 
            'No models available. Please upload a model in Settings > AI Models.'}
      </p>
      {selectedModel && isPytorchFormat(selectedModel.path) && (
        <div className="mt-1 text-xs bg-amber-50 border border-amber-200 rounded p-2 text-amber-800">
          <span className="font-medium">PyTorch Model:</span> Optimized mode with TorchScript and FP16 where available.
        </div>
      )}
    </div>
  );
};
