import React, { useState, useEffect } from 'react';
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardFooter, 
  CardHeader, 
  CardTitle 
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Server, 
  Settings, 
  Cpu,
  Trash2,
  Network,
  RefreshCw,
  Plus 
} from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import EdgeDeviceMetrics from './EdgeDeviceMetrics';
import EdgeModelDeployment from './EdgeModelDeployment';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export interface EdgeDevice {
  id: string;
  name: string;
  type: string;
  status: 'online' | 'offline' | 'degraded';
  lastSeen: Date;
  metrics: {
    cpu: number;
    gpu: number;
    ram: number;
    storage: number;
    temperature: number;
    inferenceTime: number;
    inferenceCount: number;
  };
  models: string[];
  cameras: string[];
  ipAddress: string;
  hwAcceleration: string;
}

interface EdgeDeviceManagerProps {
  onDeviceSelect?: (device: EdgeDevice) => void;
}

const EdgeDeviceManager: React.FC<EdgeDeviceManagerProps> = ({ onDeviceSelect }) => {
  const [edgeDevices, setEdgeDevices] = useState<EdgeDevice[]>([
    {
      id: 'edge-1',
      name: 'Edge Gateway - Office',
      type: 'NVIDIA Jetson Nano',
      status: 'online',
      lastSeen: new Date(),
      metrics: {
        cpu: 42,
        gpu: 28,
        ram: 65,
        storage: 47,
        temperature: 52,
        inferenceTime: 15.3,
        inferenceCount: 12450
      },
      models: ['YOLOv11', 'Face Recognition Pro'],
      cameras: ['Front Entrance', 'Reception'],
      ipAddress: '192.168.1.101',
      hwAcceleration: 'CUDA'
    },
    {
      id: 'edge-2',
      name: 'Edge Node - Warehouse',
      type: 'Google Coral Dev Board',
      status: 'online',
      lastSeen: new Date(),
      metrics: {
        cpu: 38,
        gpu: 75,
        ram: 42,
        storage: 31,
        temperature: 48,
        inferenceTime: 8.7,
        inferenceCount: 8932
      },
      models: ['YOLOv11'],
      cameras: ['Warehouse', 'Loading Dock'],
      ipAddress: '192.168.1.102',
      hwAcceleration: 'TPU'
    },
    {
      id: 'edge-3',
      name: 'Edge Gateway - Parking',
      type: 'Intel NUC w/ OpenVINO',
      status: 'offline',
      lastSeen: new Date(Date.now() - 86400000), // 1 day ago
      metrics: {
        cpu: 0,
        gpu: 0,
        ram: 0,
        storage: 61,
        temperature: 0,
        inferenceTime: 22.5,
        inferenceCount: 5231
      },
      models: ['YOLOv11'],
      cameras: ['Parking Lot'],
      ipAddress: '192.168.1.103',
      hwAcceleration: 'OpenVINO'
    }
  ]);

  const [selectedDevice, setSelectedDevice] = useState<string | null>(null);

  useEffect(() => {
    const updateInterval = setInterval(() => {
      setEdgeDevices(prevDevices => 
        prevDevices.map(device => {
          if (device.status === 'online') {
            return {
              ...device,
              lastSeen: new Date(),
              metrics: {
                ...device.metrics,
                cpu: Math.min(95, Math.max(15, device.metrics.cpu + (Math.random() * 10 - 5))),
                gpu: Math.min(95, Math.max(15, device.metrics.gpu + (Math.random() * 10 - 5))),
                ram: Math.min(95, Math.max(15, device.metrics.ram + (Math.random() * 6 - 3))),
                temperature: Math.min(85, Math.max(35, device.metrics.temperature + (Math.random() * 4 - 2))),
                inferenceCount: device.metrics.inferenceCount + Math.floor(Math.random() * 10)
              }
            };
          }
          return device;
        })
      );
    }, 5000);

    return () => clearInterval(updateInterval);
  }, []);

  useEffect(() => {
    if (selectedDevice && onDeviceSelect) {
      const device = edgeDevices.find(d => d.id === selectedDevice);
      if (device) {
        onDeviceSelect(device);
      }
    }
  }, [selectedDevice, edgeDevices, onDeviceSelect]);

  const handleRebootDevice = (deviceId: string) => {
    toast.info("Rebooting edge device...", {
      description: "This may take a few minutes"
    });
    
    setEdgeDevices(prevDevices => 
      prevDevices.map(device => 
        device.id === deviceId 
          ? { ...device, status: 'offline' } 
          : device
      )
    );
    
    setTimeout(() => {
      setEdgeDevices(prevDevices => 
        prevDevices.map(device => 
          device.id === deviceId 
            ? { 
                ...device, 
                status: 'online',
                lastSeen: new Date(),
                metrics: {
                  ...device.metrics,
                  cpu: 25,
                  gpu: 10,
                  ram: 30,
                  temperature: 42
                }
              } 
            : device
        )
      );
      
      toast.success("Edge device reboot complete", {
        description: "Device is now back online"
      });
    }, 8000);
  };

  const handleReconnectDevice = (deviceId: string) => {
    toast.info("Attempting to reconnect...", {
      description: "Establishing connection to edge device"
    });
    
    setTimeout(() => {
      if (Math.random() > 0.2) {
        setEdgeDevices(prevDevices => 
          prevDevices.map(device => 
            device.id === deviceId 
              ? { 
                  ...device, 
                  status: 'online',
                  lastSeen: new Date(),
                  metrics: {
                    ...device.metrics,
                    cpu: 30,
                    gpu: 15,
                    ram: 40,
                    temperature: 45
                  }
                } 
              : device
          )
        );
        
        toast.success("Connection established", {
          description: "Edge device is now online"
        });
      } else {
        toast.error("Connection failed", {
          description: "Could not connect to edge device. Please check hardware and network."
        });
      }
    }, 3000);
  };

  const getStatusColor = (status: 'online' | 'offline' | 'degraded') => {
    switch (status) {
      case 'online': return 'bg-green-500';
      case 'offline': return 'bg-red-500';
      case 'degraded': return 'bg-yellow-500';
      default: return 'bg-gray-500';
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Server className="mr-2 text-avianet-red" size={18} />
            Edge Computing Devices
          </CardTitle>
          <CardDescription>
            Monitor and manage edge devices running inference at the network edge
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {edgeDevices.map((device) => (
              <div 
                key={device.id} 
                className={`border rounded-md p-4 ${selectedDevice === device.id ? 'border-avianet-red' : ''}`}
                onClick={() => {
                  setSelectedDevice(device.id === selectedDevice ? null : device.id);
                  if (device.id !== selectedDevice && onDeviceSelect) {
                    onDeviceSelect(device);
                  }
                }}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <div className="flex items-center">
                      <h3 className="font-medium">{device.name}</h3>
                      <div className={`ml-2 w-3 h-3 rounded-full ${getStatusColor(device.status)}`}></div>
                    </div>
                    <div className="flex flex-wrap gap-2 mt-1">
                      <Badge variant="outline" className="bg-secondary/50">
                        {device.type}
                      </Badge>
                      <Badge variant="outline" className="bg-secondary/50">
                        {device.hwAcceleration}
                      </Badge>
                      <Badge variant="outline" className="bg-secondary/50">
                        {device.ipAddress}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      Last seen: {device.status === 'online' 
                        ? 'Online now' 
                        : `${Math.round((Date.now() - device.lastSeen.getTime()) / 60000)} minutes ago`}
                    </p>
                  </div>
                  <div className="flex space-x-2">
                    {device.status === 'online' ? (
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRebootDevice(device.id);
                        }}
                      >
                        <Settings className="h-4 w-4 mr-2" />
                        Reboot
                      </Button>
                    ) : (
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleReconnectDevice(device.id);
                        }}
                      >
                        <WifiOff className="h-4 w-4 mr-2" />
                        Reconnect
                      </Button>
                    )}
                  </div>
                </div>
                
                {device.status === 'online' && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-3">
                    <div>
                      <div className="text-xs text-muted-foreground">CPU</div>
                      <Progress value={device.metrics.cpu} className="h-2 mt-1" />
                      <div className="text-xs mt-1 font-medium">{Math.round(device.metrics.cpu)}%</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">GPU/TPU</div>
                      <Progress value={device.metrics.gpu} className="h-2 mt-1" />
                      <div className="text-xs mt-1 font-medium">{Math.round(device.metrics.gpu)}%</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">RAM</div>
                      <Progress value={device.metrics.ram} className="h-2 mt-1" />
                      <div className="text-xs mt-1 font-medium">{Math.round(device.metrics.ram)}%</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Storage</div>
                      <Progress value={device.metrics.storage} className="h-2 mt-1" />
                      <div className="text-xs mt-1 font-medium">{Math.round(device.metrics.storage)}%</div>
                    </div>
                  </div>
                )}
                
                {selectedDevice === device.id && (
                  <div className="mt-4 pt-4 border-t">
                    <Tabs defaultValue="metrics">
                      <TabsList className="mb-4">
                        <TabsTrigger value="metrics">Metrics</TabsTrigger>
                        <TabsTrigger value="models">Models</TabsTrigger>
                        <TabsTrigger value="cameras">Cameras</TabsTrigger>
                      </TabsList>
                      
                      <TabsContent value="metrics">
                        <EdgeDeviceMetrics device={device} />
                      </TabsContent>
                      
                      <TabsContent value="models">
                        <EdgeModelDeployment 
                          device={device} 
                          onModelDeployed={(modelId) => {
                            if (!device.models.includes(modelId)) {
                              setEdgeDevices(prevDevices => 
                                prevDevices.map(d => 
                                  d.id === device.id 
                                    ? { ...d, models: [...d.models, modelId] } 
                                    : d
                                )
                              );
                              toast.success(`Model deployed to ${device.name}`, {
                                description: "Edge device is now using the new model for inference"
                              });
                              
                              if (onDeviceSelect) {
                                const updatedDevice = {
                                  ...device,
                                  models: [...device.models, modelId]
                                };
                                onDeviceSelect(updatedDevice);
                              }
                            }
                          }}
                          onModelRemoved={(modelId) => {
                            setEdgeDevices(prevDevices => 
                              prevDevices.map(d => 
                                d.id === device.id 
                                  ? { ...d, models: d.models.filter(m => m !== modelId) } 
                                  : d
                              )
                            );
                            toast.info(`Model removed from ${device.name}`, {
                              description: "The model has been unloaded from the edge device"
                            });
                            
                            if (onDeviceSelect) {
                              const updatedDevice = {
                                ...device,
                                models: device.models.filter(m => m !== modelId)
                              };
                              onDeviceSelect(updatedDevice);
                            }
                          }}
                        />
                      </TabsContent>
                      
                      <TabsContent value="cameras">
                        <div className="space-y-4">
                          <h4 className="font-medium text-sm">Assigned Cameras</h4>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {device.cameras.map(camera => (
                              <div key={camera} className="border rounded-md p-2 flex justify-between items-center">
                                <div className="flex items-center">
                                  <MonitorCheck className="h-4 w-4 mr-2 text-avianet-red" />
                                  <span className="text-sm">{camera}</span>
                                </div>
                                <Button 
                                  variant="ghost" 
                                  size="sm"
                                  onClick={() => {
                                    setEdgeDevices(prevDevices => 
                                      prevDevices.map(d => 
                                        d.id === device.id 
                                          ? { ...d, cameras: d.cameras.filter(c => c !== camera) } 
                                          : d
                                      )
                                    );
                                    toast.info(`Camera unassigned from ${device.name}`);
                                  }}
                                >
                                  Unassign
                                </Button>
                              </div>
                            ))}
                          </div>
                          
                          <div className="mt-4">
                            <h4 className="font-medium text-sm mb-2">Available Cameras</h4>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {['Parking Lot', 'Office Area', 'Side Entrance', 'Loading Dock', 'Front Entrance', 'Reception', 'Warehouse']
                                .filter(camera => !device.cameras.includes(camera))
                                .map(camera => (
                                  <div key={camera} className="border rounded-md p-2 flex justify-between items-center">
                                    <div className="flex items-center">
                                      <MonitorCheck className="h-4 w-4 mr-2 text-gray-400" />
                                      <span className="text-sm">{camera}</span>
                                    </div>
                                    <Button 
                                      variant="outline" 
                                      size="sm"
                                      onClick={() => {
                                        setEdgeDevices(prevDevices => 
                                          prevDevices.map(d => 
                                            d.id === device.id 
                                              ? { ...d, cameras: [...d.cameras, camera] } 
                                              : d
                                          )
                                        );
                                        toast.success(`Camera assigned to ${device.name}`);
                                      }}
                                    >
                                      Assign
                                    </Button>
                                  </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </TabsContent>
                    </Tabs>
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
        <CardFooter>
          <Button 
            variant="outline"
            onClick={() => {
              toast.info("Scanning network for edge devices...");
              
              setTimeout(() => {
                const newDevice: EdgeDevice = {
                  id: `edge-${edgeDevices.length + 1}`,
                  name: `Edge Node ${edgeDevices.length + 1}`,
                  type: 'Raspberry Pi 4 w/ Coral USB',
                  status: 'online',
                  lastSeen: new Date(),
                  metrics: {
                    cpu: 22,
                    gpu: 18,
                    ram: 35,
                    storage: 28,
                    temperature: 46,
                    inferenceTime: 25.2,
                    inferenceCount: 0
                  },
                  models: [],
                  cameras: [],
                  ipAddress: `192.168.1.${104 + edgeDevices.length}`,
                  hwAcceleration: 'TPU'
                };
                
                setEdgeDevices(prev => [...prev, newDevice]);
                
                toast.success("New edge device discovered", {
                  description: `${newDevice.name} (${newDevice.type}) is ready to use`
                });
              }, 5000);
            }}
          >
            <Server className="mr-2 h-4 w-4" />
            Discover Edge Devices
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
};

export default EdgeDeviceManager;
