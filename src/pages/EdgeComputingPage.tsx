
import React from 'react';
import EdgeDeviceManager from '@/components/edge/EdgeDeviceManager';

const EdgeComputingPage = () => {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Edge Computing</h1>
      </div>
      
      <EdgeDeviceManager />
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="border rounded-md p-4">
          <h2 className="text-lg font-medium mb-2">Edge AI Benefits</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Edge computing brings AI processing closer to the source of data, reducing latency and bandwidth usage while enhancing privacy.
          </p>
          <h3 className="text-md font-medium mb-1">Key Advantages:</h3>
          <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1 ml-2">
            <li>Reduced latency (10-100ms vs 300-500ms)</li>
            <li>Lower bandwidth consumption</li>
            <li>Continue operation during network outages</li>
            <li>Enhanced data privacy and security</li>
            <li>Scalable distributed processing</li>
          </ul>
        </div>
        
        <div className="border rounded-md p-4">
          <h2 className="text-lg font-medium mb-2">Hardware Requirements</h2>
          <p className="text-sm text-muted-foreground mb-3">
            Edge devices require specific hardware for optimal AI model performance.
          </p>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>NVIDIA Jetson:</span>
              <span className="font-medium">CUDA Acceleration</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>Google Coral:</span>
              <span className="font-medium">TPU Acceleration</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>Intel NUC:</span>
              <span className="font-medium">OpenVINO</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>Raspberry Pi:</span>
              <span className="font-medium">TFLite/ARM NN</span>
            </div>
          </div>
        </div>
        
        <div className="border rounded-md p-4">
          <h2 className="flex items-center text-lg font-medium mb-2">
            <Cpu className="mr-2 text-avianet-red" size={18} />
            Model Optimization
          </h2>
          <p className="text-sm text-muted-foreground mb-3">
            AI models are automatically optimized for edge deployment using hardware-specific acceleration.
          </p>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Quantization:</span>
              <span className="font-medium">FP32 → INT8</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>Model pruning:</span>
              <span className="font-medium">30-50% size reduction</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>Hardware compilation:</span>
              <span className="font-medium">Device-specific</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>Memory footprint:</span>
              <span className="font-medium">Optimized</span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Note: Edge optimization may slightly reduce accuracy (1-3%) in exchange for significant speed improvements.
          </p>
        </div>
      </div>
    </div>
  );
};

export default EdgeComputingPage;
