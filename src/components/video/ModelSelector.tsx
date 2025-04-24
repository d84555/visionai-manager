
import React from 'react';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

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
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="model-selector">AI Model for Object Detection</Label>
      <Select 
        onValueChange={onModelChange}
        value={selectedModel ? availableModels.find(m => m.name === selectedModel.name)?.id : "none"}
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Select a model for detection" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">No detection (Clear model)</SelectItem>
          {availableModels.map(model => (
            <SelectItem key={model.id} value={model.id}>
              {model.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">
        Select an AI model to use for object detection on this video feed
      </p>
    </div>
  );
};
