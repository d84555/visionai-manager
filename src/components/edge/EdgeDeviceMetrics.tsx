
import React from 'react';
import { EdgeDevice } from './EdgeDeviceManager';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Gauge, Cpu, HardDrive, ChartBar } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

interface EdgeDeviceMetricsProps {
  device: EdgeDevice;
}

const EdgeDeviceMetrics: React.FC<EdgeDeviceMetricsProps> = ({ device }) => {
  // Determine temperature status color
  const getTempColor = (temp: number) => {
    if (temp > 75) return 'text-red-500';
    if (temp > 60) return 'text-yellow-500';
    return 'text-green-500';
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm font-medium flex items-center">
              <Cpu className="w-4 h-4 mr-2 text-avianet-red" />
              Resource Usage
            </CardTitle>
          </CardHeader>
          <CardContent className="py-2">
            <div className="space-y-2">
              <div>
                <div className="flex justify-between text-sm">
                  <span>CPU</span>
                  <span className="font-medium">{Math.round(device.metrics.cpu)}%</span>
                </div>
                <Progress value={device.metrics.cpu} className="h-2 mt-1" />
              </div>
              <div>
                <div className="flex justify-between text-sm">
                  <span>GPU/TPU</span>
                  <span className="font-medium">{Math.round(device.metrics.gpu)}%</span>
                </div>
                <Progress value={device.metrics.gpu} className="h-2 mt-1" />
              </div>
              <div>
                <div className="flex justify-between text-sm">
                  <span>RAM</span>
                  <span className="font-medium">{Math.round(device.metrics.ram)}%</span>
                </div>
                <Progress value={device.metrics.ram} className="h-2 mt-1" />
              </div>
              <div>
                <div className="flex justify-between text-sm">
                  <span>Storage</span>
                  <span className="font-medium">{Math.round(device.metrics.storage)}%</span>
                </div>
                <Progress value={device.metrics.storage} className="h-2 mt-1" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm font-medium flex items-center">
              <Gauge className="w-4 h-4 mr-2 text-avianet-red" />
              System Health
            </CardTitle>
          </CardHeader>
          <CardContent className="py-2">
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="relative inline-flex">
                  <svg className="w-24 h-24" viewBox="0 0 36 36">
                    <path
                      className="text-gray-200 fill-current"
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      strokeWidth="1"
                      stroke="currentColor"
                      fill="none"
                      strokeLinecap="round"
                    />
                    <path
                      className={`${getTempColor(device.metrics.temperature)} fill-current`}
                      strokeDasharray={`${device.metrics.temperature}, 100`}
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      strokeWidth="1"
                      stroke="currentColor"
                      fill="none"
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center text-2xl font-semibold">
                    <span className={getTempColor(device.metrics.temperature)}>
                      {Math.round(device.metrics.temperature)}°C
                    </span>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground mt-2">Temperature</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm font-medium flex items-center">
              <ChartBar className="w-4 h-4 mr-2 text-avianet-red" />
              Inference Statistics
            </CardTitle>
          </CardHeader>
          <CardContent className="py-2">
            <div className="space-y-4">
              <div className="text-center py-1">
                <p className="text-3xl font-semibold text-avianet-red">
                  {device.metrics.inferenceTime.toFixed(1)} ms
                </p>
                <p className="text-sm text-muted-foreground">Average Inference Time</p>
              </div>
              
              <div className="text-center py-1">
                <p className="text-3xl font-semibold">
                  {device.metrics.inferenceCount.toLocaleString()}
                </p>
                <p className="text-sm text-muted-foreground">Total Inferences</p>
              </div>
              
              <div className="text-center text-xs text-muted-foreground border-t pt-2 mt-2">
                <p>Hardware Acceleration: {device.hwAcceleration}</p>
                <p>Model Format: {device.hwAcceleration === 'TPU' ? 'Edge TPU' : device.hwAcceleration === 'CUDA' ? 'TensorRT' : 'OpenVINO IR'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm font-medium flex items-center">
            <HardDrive className="w-4 h-4 mr-2 text-avianet-red" />
            System Information
          </CardTitle>
        </CardHeader>
        <CardContent className="py-2">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-medium">Device Type</p>
              <p className="text-sm text-muted-foreground">{device.type}</p>
            </div>
            <div>
              <p className="text-sm font-medium">IP Address</p>
              <p className="text-sm text-muted-foreground">{device.ipAddress}</p>
            </div>
            <div>
              <p className="text-sm font-medium">Status</p>
              <p className="text-sm text-muted-foreground capitalize">{device.status}</p>
            </div>
            <div>
              <p className="text-sm font-medium">Last Seen</p>
              <p className="text-sm text-muted-foreground">
                {device.status === 'online' 
                  ? 'Online now' 
                  : device.lastSeen.toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium">Deployed Models</p>
              <p className="text-sm text-muted-foreground">
                {device.models.length > 0 
                  ? device.models.join(', ') 
                  : 'No models deployed'}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium">Connected Cameras</p>
              <p className="text-sm text-muted-foreground">
                {device.cameras.length > 0 
                  ? device.cameras.join(', ') 
                  : 'No cameras connected'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default EdgeDeviceMetrics;
