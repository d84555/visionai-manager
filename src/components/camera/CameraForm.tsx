
import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Camera } from '@/services/CameraService';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { toast } from 'sonner';
import CameraService from '@/services/CameraService';
import { Loader } from 'lucide-react';

const formSchema = z.object({
  name: z.string().min(1, 'Camera name is required'),
  ipAddress: z.string().min(1, 'IP address is required'),
  port: z.coerce.number().int().min(1, 'Port must be a positive number'),
  protocol: z.enum(['RTSP', 'HTTP', 'ONVIF']),
  brand: z.string().min(1, 'Brand is required'),
  streamType: z.enum(['main', 'sub', 'third']),
  channelNumber: z.coerce.number().int().min(1, 'Channel number must be a positive number'),
  username: z.string().optional(),
  password: z.string().optional(),
  customStreamUrl: z.string().optional()
});

type FormValues = z.infer<typeof formSchema>;

interface CameraFormProps {
  camera?: Camera;
  onSave: (camera: Camera) => void;
  onCancel: () => void;
}

const CameraForm: React.FC<CameraFormProps> = ({ 
  camera,
  onSave,
  onCancel
}) => {
  const [isTesting, setIsTesting] = React.useState(false);

  const defaultValues: FormValues = camera ? {
    name: camera.name,
    ipAddress: camera.ipAddress,
    port: camera.port,
    protocol: camera.protocol,
    brand: camera.brand,
    streamType: camera.streamType,
    channelNumber: camera.channelNumber,
    username: camera.username || '',
    password: camera.password || '',
    customStreamUrl: camera.customStreamUrl || ''
  } : {
    name: '',
    ipAddress: '192.168.1.100',
    port: 554,
    protocol: 'RTSP',
    brand: 'Hikvision',
    streamType: 'main',
    channelNumber: 1,
    username: 'admin',
    password: '',
    customStreamUrl: ''
  };

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues
  });

  const handleTestConnection = async () => {
    const values = form.getValues();
    setIsTesting(true);

    try {
      const testCamera = {
        ...values,
        id: camera?.id || ''
      };

      const isConnected = await CameraService.testCameraConnection(testCamera);
      
      if (isConnected) {
        toast.success('Connection successful!', {
          description: 'Camera stream is accessible'
        });
      } else {
        toast.error('Connection failed', {
          description: 'Could not connect to the camera stream'
        });
      }
    } catch (error) {
      toast.error('Connection test error', {
        description: error instanceof Error ? error.message : 'An unknown error occurred'
      });
    } finally {
      setIsTesting(false);
    }
  };

  const onSubmit = async (values: FormValues) => {
    try {
      if (camera) {
        // Update existing camera
        const updatedCamera = await CameraService.updateCamera({
          ...camera,
          ...values
        });
        onSave(updatedCamera);
      } else {
        // Add new camera
        const newCamera = await CameraService.addCamera(values as Omit<Camera, 'id' | 'isOnline' | 'lastChecked'>);
        onSave(newCamera);
      }
    } catch (error) {
      toast.error('Failed to save camera', {
        description: error instanceof Error ? error.message : 'An unknown error occurred'
      });
    }
  };

  const cameraBrands = [
    'Hikvision', 
    'Dahua', 
    'Honeywell', 
    'Axis', 
    'Uniview', 
    'Bosch', 
    'Hanwha', 
    'Pelco', 
    'Vivotek', 
    'Avigilon', 
    'FLIR', 
    'Generic ONVIF',
    'Other'
  ];

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Camera Name</FormLabel>
                <FormControl>
                  <Input placeholder="Front Entrance Camera" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="ipAddress"
            render={({ field }) => (
              <FormItem>
                <FormLabel>IP Address / Hostname</FormLabel>
                <FormControl>
                  <Input placeholder="192.168.1.100" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="port"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Port</FormLabel>
                <FormControl>
                  <Input type="number" min={1} max={65535} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="protocol"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Protocol</FormLabel>
                <Select 
                  onValueChange={field.onChange} 
                  defaultValue={field.value}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select protocol" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="RTSP">RTSP</SelectItem>
                    <SelectItem value="HTTP">HTTP</SelectItem>
                    <SelectItem value="ONVIF">ONVIF</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="brand"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Camera Brand</FormLabel>
                <Select 
                  onValueChange={field.onChange} 
                  defaultValue={field.value}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select brand" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {cameraBrands.map((brand) => (
                      <SelectItem key={brand} value={brand}>
                        {brand}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="streamType"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Stream Type</FormLabel>
                <Select 
                  onValueChange={field.onChange} 
                  defaultValue={field.value}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select stream type" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="main">Main Stream</SelectItem>
                    <SelectItem value="sub">Sub Stream</SelectItem>
                    <SelectItem value="third">Third Stream</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="channelNumber"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Channel Number</FormLabel>
                <FormControl>
                  <Input type="number" min={1} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="username"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Username</FormLabel>
                <FormControl>
                  <Input placeholder="admin" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Password</FormLabel>
                <FormControl>
                  <Input type="password" placeholder="••••••••" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="customStreamUrl"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Custom Stream URL (Optional)</FormLabel>
              <FormControl>
                <Input 
                  placeholder="rtsp://username:password@192.168.1.100:554/stream" 
                  {...field} 
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-between mt-6">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
          >
            Cancel
          </Button>
          <div className="flex gap-2">
            <Button 
              type="button"
              variant="secondary"
              onClick={handleTestConnection}
              disabled={isTesting}
            >
              {isTesting ? (
                <>
                  <Loader className="mr-2 h-4 w-4 animate-spin" />
                  Testing...
                </>
              ) : (
                'Test Connection'
              )}
            </Button>
            <Button type="submit">
              {camera ? 'Update' : 'Add'} Camera
            </Button>
          </div>
        </div>
      </form>
    </Form>
  );
};

export default CameraForm;
