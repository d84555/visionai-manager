
import React from 'react';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useEffect, useState } from 'react';
import StorageServiceFactory from '@/services/storage/StorageServiceFactory';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';

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
        const storageService = StorageServiceFactory.getService();
        const customModels = await storageService.listModels();
        
        const formattedCustomModels = customModels.map(model => ({
          id: model.id,
          name: model.name,
          path: model.path,
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
              <SelectItem key={model.id} value={model.id}>
                {model.name}
                {!isOnnxFormat(model.path) && (
                  <Badge variant="outline" className="ml-2 bg-yellow-100 text-yellow-800 text-xs">
                    Non-ONNX
                  </Badge>
                )}
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
            'Select an AI model to use for object detection on this video feed. ONNX models (.onnx) recommended.' : 
            'No models available. Please upload a model in Settings > AI Models.'}
      </p>
    </div>
  );
};
