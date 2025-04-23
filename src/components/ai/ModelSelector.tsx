
import React, { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import SettingsService from '@/services/SettingsService';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Info } from 'lucide-react';

interface ModelSelectorProps {
  onModelSelected?: (modelName: string, modelPath: string) => void;
}

// Mock models for demonstration
const availableModels = [
  { 
    id: 'yolov11-n', 
    name: 'YOLOv11 Nano', 
    path: '/models/yolov11-n.onnx',
    description: 'Smallest model, fastest inference, lowest accuracy'
  },
  { 
    id: 'yolov11-s', 
    name: 'YOLOv11 Small', 
    path: '/models/yolov11-s.onnx',
    description: 'Small model, good balance of speed and accuracy'
  },
  { 
    id: 'yolov11', 
    name: 'YOLOv11 Base', 
    path: '/models/yolov11.onnx', 
    description: 'Standard model, balanced performance'
  },
  { 
    id: 'yolov11-m', 
    name: 'YOLOv11 Medium', 
    path: '/models/yolov11-m.onnx',
    description: 'Medium model, higher accuracy, slower inference'
  },
  { 
    id: 'yolov11-l', 
    name: 'YOLOv11 Large', 
    path: '/models/yolov11-l.onnx',
    description: 'Largest model, highest accuracy, slowest inference'
  }
];

const ModelSelector: React.FC<ModelSelectorProps> = ({ onModelSelected }) => {
  const [selectedModel, setSelectedModel] = useState<string>('yolov11');
  const [autoApply, setAutoApply] = useState<boolean>(true);
  
  // Load saved model on mount
  useEffect(() => {
    const model = SettingsService.getActiveModel();
    if (model) {
      // Find the model ID based on the path
      const modelId = availableModels.find(m => m.path === model.path)?.id;
      if (modelId) {
        setSelectedModel(modelId);
      }
    }
    
    // Load auto-apply setting
    const modelSettings = SettingsService.getSettings('model');
    setAutoApply(modelSettings.autoApplyModel);
  }, []);
  
  // Save auto-apply setting when it changes
  useEffect(() => {
    const modelSettings = SettingsService.getSettings('model');
    SettingsService.updateSettings('model', {
      ...modelSettings,
      autoApplyModel: autoApply
    });
  }, [autoApply]);
  
  const handleModelChange = (modelId: string) => {
    setSelectedModel(modelId);
  };
  
  const handleApplyModel = () => {
    const model = availableModels.find(m => m.id === selectedModel);
    if (model) {
      // Save to settings
      SettingsService.setActiveModel(model.name, model.path);
      
      // Notify parent component if callback provided
      if (onModelSelected) {
        onModelSelected(model.name, model.path);
      }
      
      toast.success(`Applied model: ${model.name}`);
    }
  };
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>Object Detection Model</CardTitle>
        <CardDescription>
          Select the YOLO model to use for object detection
        </CardDescription>
      </CardHeader>
      <CardContent>
        <RadioGroup
          value={selectedModel}
          onValueChange={handleModelChange}
          className="space-y-2"
        >
          {availableModels.map((model) => (
            <div key={model.id} className="flex items-center space-x-2 border p-3 rounded-lg">
              <RadioGroupItem value={model.id} id={`model-${model.id}`} />
              <div className="grid gap-1.5">
                <Label htmlFor={`model-${model.id}`} className="font-medium">
                  {model.name}
                </Label>
                <p className="text-sm text-muted-foreground">
                  {model.description}
                </p>
              </div>
            </div>
          ))}
        </RadioGroup>
        
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
      <CardFooter className="flex justify-end">
        <Button onClick={handleApplyModel}>
          Apply Model
        </Button>
      </CardFooter>
    </Card>
  );
};

export default ModelSelector;
