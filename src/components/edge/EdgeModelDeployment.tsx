
import React, { useState, useEffect } from 'react';
import { EdgeDevice } from './EdgeDeviceManager';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Brain, CloudUpload, Database, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';

interface EdgeModelDeploymentProps {
  device: EdgeDevice;
  onModelDeployed: (modelId: string) => void;
  onModelRemoved: (modelId: string) => void;
}

interface AIModel {
  id: string;
  name: string;
  type: string;
  size: string;
  supportsHardware: string[];
}

const EdgeModelDeployment: React.FC<EdgeModelDeploymentProps> = ({ 
  device, 
  onModelDeployed,
  onModelRemoved
}) => {
  const [availableModels, setAvailableModels] = useState<AIModel[]>([
    {
      id: 'model-1',
      name: 'YOLOv11',
      type: 'Object Detection',
      size: '23.4 MB',
      supportsHardware: ['CUDA', 'TPU', 'OpenVINO']
    },
    {
      id: 'model-2',
      name: 'Face Recognition Pro',
      type: 'Face Recognition',
      size: '42.1 MB',
      supportsHardware: ['CUDA', 'OpenVINO']
    },
    {
      id: 'model-3',
      name: 'License Plate Reader',
      type: 'OCR',
      size: '18.7 MB',
      supportsHardware: ['CUDA', 'OpenVINO', 'TPU']
    },
    {
      id: 'model-4',
      name: 'Person Tracker Pro',
      type: 'Object Tracking',
      size: '31.2 MB',
      supportsHardware: ['CUDA', 'TPU']
    },
    {
      id: 'model-5',
      name: 'Anomaly Detection Net',
      type: 'Anomaly Detection',
      size: '26.8 MB',
      supportsHardware: ['CUDA', 'OpenVINO']
    }
  ]);
  
  const [deployingModel, setDeployingModel] = useState<string | null>(null);
  const [deployProgress, setDeployProgress] = useState(0);
  const [selectedModel, setSelectedModel] = useState<string>('');
  
  useEffect(() => {
    if (deployingModel) {
      const interval = setInterval(() => {
        setDeployProgress(prev => {
          const newProgress = prev + Math.floor(Math.random() * 10) + 1;
          if (newProgress >= 100) {
            clearInterval(interval);
            setTimeout(() => {
              onModelDeployed(deployingModel);
              setDeployingModel(null);
              setDeployProgress(0);
            }, 500);
            return 100;
          }
          return newProgress;
        });
      }, 300);
      
      return () => clearInterval(interval);
    }
  }, [deployingModel, onModelDeployed]);
  
  const handleDeployModel = () => {
    if (!selectedModel) {
      toast.error("Please select a model to deploy");
      return;
    }
    
    const model = availableModels.find(m => m.id === selectedModel);
    
    if (!model) {
      toast.error("Selected model not found");
      return;
    }
    
    // Check if hardware is supported
    if (!model.supportsHardware.includes(device.hwAcceleration)) {
      toast.error(`This model doesn't support ${device.hwAcceleration}`, {
        description: `The model only supports: ${model.supportsHardware.join(', ')}`
      });
      return;
    }
    
    // Check if already deployed
    if (device.models.includes(model.name)) {
      toast.info("Model already deployed to this device");
      return;
    }
    
    setDeployingModel(model.name);
    toast.info(`Deploying ${model.name} to ${device.name}`, {
      description: "Converting model for edge deployment..."
    });
  };
  
  const handleRemoveModel = (modelName: string) => {
    toast.info(`Removing ${modelName} from edge device...`);
    
    // Simulate removal process
    setTimeout(() => {
      onModelRemoved(modelName);
    }, 1500);
  };
  
  return (
    <div className="space-y-4">
      {device.models.length > 0 ? (
        <div>
          <h4 className="font-medium text-sm mb-2">Deployed Models</h4>
          <div className="space-y-2">
            {device.models.map(modelName => (
              <div key={modelName} className="border rounded-md p-3 flex justify-between items-center">
                <div className="flex items-center">
                  <Brain className="h-4 w-4 mr-2 text-avianet-red" />
                  <div>
                    <p className="text-sm font-medium">{modelName}</p>
                    <p className="text-xs text-muted-foreground">
                      Optimized for {device.hwAcceleration}
                    </p>
                  </div>
                </div>
                <div className="flex items-center">
                  <Badge variant="outline" className="mr-2">
                    {device.status === 'online' ? 'Active' : 'Inactive'}
                  </Badge>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => handleRemoveModel(modelName)}
                  >
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="text-center py-4 text-muted-foreground text-sm border rounded-md">
          No models deployed to this edge device yet
        </div>
      )}
      
      <div className="pt-4 border-t">
        <h4 className="font-medium text-sm mb-2">Deploy New Model</h4>
        
        {deployingModel ? (
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Deploying {deployingModel}...</span>
              <span>{deployProgress}%</span>
            </div>
            <Progress value={deployProgress} className="h-2" />
            <p className="text-xs text-muted-foreground">
              {deployProgress < 30 
                ? "Converting model for edge deployment..." 
                : deployProgress < 60 
                  ? "Optimizing for hardware acceleration..." 
                  : "Transferring to edge device..."}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="model-select">Select Model</Label>
              <Select 
                value={selectedModel} 
                onValueChange={setSelectedModel}
              >
                <SelectTrigger id="model-select">
                  <SelectValue placeholder="Choose a model to deploy" />
                </SelectTrigger>
                <SelectContent>
                  {availableModels
                    .filter(model => !device.models.includes(model.name))
                    .map(model => (
                      <SelectItem 
                        key={model.id} 
                        value={model.id}
                        disabled={!model.supportsHardware.includes(device.hwAcceleration)}
                      >
                        <div className="flex items-center">
                          <span>{model.name}</span>
                          {!model.supportsHardware.includes(device.hwAcceleration) && (
                            <span className="ml-2 text-red-500 text-xs">
                              (Incompatible)
                            </span>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              
              <p className="text-xs text-muted-foreground mt-1">
                Models must be compatible with device's {device.hwAcceleration} hardware acceleration
              </p>
            </div>
            
            <div className="flex justify-between">
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => {
                  toast.info("Checking for model updates...");
                  
                  // Simulate check for updates
                  setTimeout(() => {
                    const hasUpdates = Math.random() > 0.5;
                    
                    if (hasUpdates) {
                      toast.success("Model updates available", {
                        description: "New optimized versions of models are available for download"
                      });
                    } else {
                      toast.info("All models are up to date");
                    }
                  }, 2000);
                }}
              >
                <Database className="mr-2 h-4 w-4" />
                Check for Updates
              </Button>
              
              <Button 
                onClick={handleDeployModel}
                disabled={!selectedModel || device.status !== 'online'}
                size="sm"
              >
                <CloudUpload className="mr-2 h-4 w-4" />
                Deploy to Edge
              </Button>
            </div>
            
            {device.status !== 'online' && (
              <p className="text-xs text-red-500">
                Edge device must be online to deploy models
              </p>
            )}
          </div>
        )}
      </div>
      
      <div className="pt-4 border-t text-xs text-muted-foreground">
        <h4 className="font-medium text-sm mb-2">Optimization Information</h4>
        <p>Models deployed to this edge device are automatically:</p>
        <ul className="list-disc list-inside mt-1 space-y-1">
          <li>Quantized for reduced memory footprint</li>
          <li>Compiled for {device.hwAcceleration} hardware acceleration</li>
          <li>Optimized for low-latency inference</li>
          <li>Cached locally for offline operation</li>
        </ul>
      </div>
    </div>
  );
};

export default EdgeModelDeployment;
