
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Server, Plus, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import EdgeDeviceService from '@/services/EdgeDeviceService';

interface ManualEdgeDeviceFormProps {
  onDeviceAdded: () => void;
}

const ManualEdgeDeviceForm: React.FC<ManualEdgeDeviceFormProps> = ({ onDeviceAdded }) => {
  const [isAdding, setIsAdding] = useState(false);
  const [formState, setFormState] = useState({
    name: '',
    ipAddress: '',
    authToken: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormState(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formState.name || !formState.ipAddress) {
      toast.error('Device name and IP address are required');
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      await EdgeDeviceService.addManualEdgeDevice({
        name: formState.name,
        ipAddress: formState.ipAddress,
        authToken: formState.authToken,
      });
      
      // Reset form and close it
      setFormState({
        name: '',
        ipAddress: '',
        authToken: '',
      });
      setIsAdding(false);
      
      // Notify parent component
      onDeviceAdded();
      
    } catch (error) {
      console.error('Failed to add edge device:', error);
      toast.error('Failed to add edge device');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    setIsAdding(false);
    setFormState({
      name: '',
      ipAddress: '',
      authToken: '',
    });
  };

  if (!isAdding) {
    return (
      <Button onClick={() => setIsAdding(true)} variant="outline" className="w-full">
        <Plus className="mr-2" size={16} />
        Add Edge Device Manually
      </Button>
    );
  }

  return (
    <Card className="w-full mb-6">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center">
          <Server className="mr-2" size={18} />
          Add New Edge Device
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="device-name">Device Name</Label>
            <Input
              id="device-name"
              name="name"
              value={formState.name}
              onChange={handleInputChange}
              placeholder="e.g., Warehouse Edge Node"
              required
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="ip-address">IP Address or Hostname</Label>
            <Input
              id="ip-address"
              name="ipAddress"
              value={formState.ipAddress}
              onChange={handleInputChange}
              placeholder="e.g., 192.168.1.100 or edge.local"
              required
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="auth-token">Authentication Token (Optional)</Label>
            <Input
              id="auth-token"
              name="authToken"
              value={formState.authToken}
              onChange={handleInputChange}
              placeholder="Enter authentication token if required"
              type="password"
            />
            <p className="text-xs text-muted-foreground">
              If your edge device requires authentication, enter the token here
            </p>
          </div>
        </form>
      </CardContent>
      <CardFooter className="flex justify-between">
        <Button variant="outline" onClick={handleCancel} disabled={isSubmitting}>
          <X className="mr-2" size={16} />
          Cancel
        </Button>
        <Button onClick={handleSubmit} disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <span className="mr-2">Adding...</span>
              <span className="animate-spin">⏳</span>
            </>
          ) : (
            <>
              <Check className="mr-2" size={16} />
              Add Device
            </>
          )}
        </Button>
      </CardFooter>
    </Card>
  );
};

export default ManualEdgeDeviceForm;
