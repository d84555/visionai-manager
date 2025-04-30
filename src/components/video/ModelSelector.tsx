
import React from 'react';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useEffect, useState } from 'react';
import StorageServiceFactory from '@/services/storage/StorageServiceFactory';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, Cpu, Plus, X, Settings } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

interface ModelSelectorProps {
  selectedModels: { name: string; path: string }[];
  availableModels: { id: string; name: string; path: string }[];
  onModelChange: (modelIds: string[]) => void;
}

export const ModelSelector: React.FC<ModelSelectorProps> = ({
  selectedModels,
  availableModels,
  onModelChange,
}) => {
  const [models, setModels] = useState<{ id: string; name: string; path: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddModel, setShowAddModel] = useState(false);
  const [modelToAdd, setModelToAdd] = useState<string | null>(null);
  const navigate = useNavigate();

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
        <Badge variant="outline" className="ml-2 bg-green-100 text-green-800 text-xs">ONNX</Badge>
      );
    } else if (isPytorchFormat(path)) {
      return (
        <Badge variant="outline" className="ml-2 bg-amber-100 text-amber-800 text-xs">PyTorch</Badge>
      );
    }
    return null;
  };

  // Handler for model selection changes
  const handleModelToggle = (modelId: string, checked: boolean) => {
    // Get the model corresponding to the ID
    const model = displayModels.find(m => m.id === modelId);
    if (!model) return;
    
    // Update the list of selected models
    const selectedModelIds = selectedModels.map(m => {
      const foundModel = displayModels.find(dm => dm.name === m.name && dm.path === m.path);
      return foundModel?.id || '';
    }).filter(id => id !== '');
    
    // Add or remove the model based on checkbox state
    let newSelectedIds: string[];
    
    if (checked) {
      // Add the model if it's not already selected
      newSelectedIds = [...selectedModelIds, modelId];
    } else {
      // Remove the model if it's currently selected
      newSelectedIds = selectedModelIds.filter(id => id !== modelId);
    }
    
    // Call the parent's handler with the updated model IDs
    onModelChange(newSelectedIds);
  };

  const handleAddModel = () => {
    if (modelToAdd) {
      const selectedModelIds = selectedModels.map(m => {
        const foundModel = displayModels.find(dm => dm.name === m.name && dm.path === m.path);
        return foundModel?.id || '';
      }).filter(id => id !== '');
      
      // Add the new model if it's not already selected
      if (!selectedModelIds.includes(modelToAdd)) {
        onModelChange([...selectedModelIds, modelToAdd]);
      }
      
      // Reset selection state
      setModelToAdd(null);
      setShowAddModel(false);
    }
  };

  const handleRemoveModel = (modelId: string) => {
    const selectedModelIds = selectedModels.map(m => {
      const foundModel = displayModels.find(dm => dm.name === m.name && dm.path === m.path);
      return foundModel?.id || '';
    }).filter(id => id !== '');
    
    // Remove the model from the selection
    const newSelectedIds = selectedModelIds.filter(id => id !== modelId);
    onModelChange(newSelectedIds);
  };

  const navigateToSettings = () => {
    navigate('/settings');
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-between items-center mb-2">
        <Label htmlFor="model-selector">AI Models for Object Detection</Label>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={navigateToSettings} 
          className="flex items-center gap-1"
          title="Manage models in Settings"
        >
          <Settings className="h-4 w-4" />
          Manage
        </Button>
      </div>
      
      {/* Selected Models Display */}
      <div className="flex flex-wrap gap-2 mb-2">
        {selectedModels.length === 0 ? (
          <div className="text-sm text-muted-foreground p-2 border border-dashed rounded-md w-full text-center">
            No models selected. Detection will be disabled.
          </div>
        ) : (
          selectedModels.map((model, index) => {
            const modelId = displayModels.find(m => m.name === model.name && m.path === model.path)?.id;
            return (
              <div key={index} className="flex items-center bg-secondary/30 border rounded-md px-2 py-1">
                <span className="text-sm">{model.name}</span>
                {getModelFormatBadge(model.path)}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 ml-2"
                  onClick={() => modelId && handleRemoveModel(modelId)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            );
          })
        )}
      </div>
      
      {/* Add Model Button or Select */}
      {!showAddModel ? (
        <Button 
          variant="outline" 
          size="sm" 
          className="flex items-center gap-1 w-full mb-2"
          onClick={() => setShowAddModel(true)}
        >
          <Plus className="h-4 w-4" /> Add Model
        </Button>
      ) : (
        <div className="space-y-2">
          <Select 
            onValueChange={setModelToAdd}
            value={modelToAdd || ""}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select a model to add" />
            </SelectTrigger>
            <SelectContent>
              {isLoading ? (
                <SelectItem value="loading" disabled>Loading models...</SelectItem>
              ) : displayModels.length > 0 ? (
                <ScrollArea className="h-[200px]">
                  {displayModels
                    .filter(model => !selectedModels.some(sm => 
                      sm.name === model.name && sm.path === model.path))
                    .map(model => (
                      <SelectItem key={model.id} value={model.id} className="flex items-center justify-between py-3">
                        <div className="flex items-center space-x-2">
                          <span>{model.name}</span>
                          {getModelFormatBadge(model.path)}
                        </div>
                      </SelectItem>
                    ))}
                </ScrollArea>
              ) : (
                <SelectItem value="no-models" disabled>No models available. Please upload a model in Settings.</SelectItem>
              )}
            </SelectContent>
          </Select>
          
          <div className="flex gap-2">
            <Button size="sm" onClick={handleAddModel} disabled={!modelToAdd} className="flex-1">
              Add Model
            </Button>
            <Button size="sm" variant="outline" onClick={() => {
              setShowAddModel(false);
              setModelToAdd(null);
            }} className="flex-1">
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Warning for PyTorch models */}
      {selectedModels.some(model => isPytorchFormat(model.path)) && (
        <div className="mt-1 text-xs bg-amber-50 border border-amber-200 rounded p-2 text-amber-800 flex items-center">
          <Cpu className="w-3.5 h-3.5 mr-1.5 inline" />
          <span>
            <span className="font-medium">PyTorch Model:</span> Using TorchScript and FP16 optimization when available.
          </span>
        </div>
      )}
      
      <p className="text-xs text-muted-foreground">
        {isLoading ? 'Loading available models...' : 
          displayModels.length > 0 ? 
            'Add AI models for object detection. Multiple models can be used simultaneously.' : 
            'No models available. Please upload a model in Settings > AI Models.'}
      </p>
    </div>
  );
};
