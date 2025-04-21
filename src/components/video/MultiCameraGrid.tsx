
import React, { useEffect, useState } from 'react';
import VideoFeed from './VideoFeed';
import { Loader, Camera } from 'lucide-react';
import { Card } from '@/components/ui/card';

interface MultiCameraGridProps {
  layout: '1x1' | '2x2' | '3x3' | '4x4';
  streamType: 'main' | 'sub';
}

interface CameraFeed {
  id: string;
  name: string;
  streamUrl: {
    main: string;
    sub: string;
  };
}

const MultiCameraGrid: React.FC<MultiCameraGridProps> = ({ layout, streamType }) => {
  const [cameraFeeds, setCameraFeeds] = useState<CameraFeed[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Mock camera data - in a real app, this would come from an API
  useEffect(() => {
    // Simulate API fetch
    setTimeout(() => {
      const mockCameras: CameraFeed[] = [
        {
          id: 'cam1',
          name: 'Front Entrance',
          streamUrl: {
            main: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
            sub: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4'
          }
        },
        {
          id: 'cam2',
          name: 'Parking Lot',
          streamUrl: {
            main: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
            sub: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4'
          }
        },
        {
          id: 'cam3',
          name: 'Warehouse',
          streamUrl: {
            main: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4',
            sub: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4'
          }
        },
        {
          id: 'cam4',
          name: 'Office Area',
          streamUrl: {
            main: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4',
            sub: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4'
          }
        },
        {
          id: 'cam5',
          name: 'Side Entrance',
          streamUrl: {
            main: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/SubaruOutbackOnStreetAndDirt.mp4',
            sub: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4'
          }
        },
        {
          id: 'cam6',
          name: 'Loading Dock',
          streamUrl: {
            main: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/VolkswagenGTIReview.mp4',
            sub: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/WeAreGoingOnBullrun.mp4'
          }
        },
        {
          id: 'cam7',
          name: 'Hallway',
          streamUrl: {
            main: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/WhatCarCanYouGetForAGrand.mp4',
            sub: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4'
          }
        },
        {
          id: 'cam8',
          name: 'Server Room',
          streamUrl: {
            main: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
            sub: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4'
          }
        },
        {
          id: 'cam9',
          name: 'Exterior Back',
          streamUrl: {
            main: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
            sub: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4'
          }
        },
        {
          id: 'cam10',
          name: 'Meeting Room',
          streamUrl: {
            main: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4',
            sub: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4'
          }
        },
        {
          id: 'cam11',
          name: 'Reception',
          streamUrl: {
            main: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4',
            sub: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/SubaruOutbackOnStreetAndDirt.mp4'
          }
        },
        {
          id: 'cam12',
          name: 'Cafeteria',
          streamUrl: {
            main: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4',
            sub: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/VolkswagenGTIReview.mp4'
          }
        },
        {
          id: 'cam13',
          name: 'Main Floor',
          streamUrl: {
            main: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/WeAreGoingOnBullrun.mp4',
            sub: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/WhatCarCanYouGetForAGrand.mp4'
          }
        },
        {
          id: 'cam14',
          name: 'Storage Area',
          streamUrl: {
            main: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
            sub: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4'
          }
        },
        {
          id: 'cam15',
          name: 'Garage',
          streamUrl: {
            main: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
            sub: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4'
          }
        },
        {
          id: 'cam16',
          name: 'Rooftop',
          streamUrl: {
            main: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4',
            sub: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4'
          }
        },
      ];
      
      setCameraFeeds(mockCameras);
      setLoading(false);
    }, 1000);
  }, []);
  
  // Determine how many cameras to show based on layout
  const getCameraCount = () => {
    switch (layout) {
      case '1x1': return 1;
      case '2x2': return 4;
      case '3x3': return 9;
      case '4x4': return 16;
      default: return 1;
    }
  };
  
  const getGridClassName = () => {
    switch (layout) {
      case '1x1': return 'grid-cols-1';
      case '2x2': return 'grid-cols-1 sm:grid-cols-2';
      case '3x3': return 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3';
      case '4x4': return 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4';
      default: return 'grid-cols-1';
    }
  };
  
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12">
        <Loader className="text-avianet-red animate-spin mb-4" size={48} />
        <p className="text-gray-700 dark:text-gray-300">Loading camera feeds...</p>
      </div>
    );
  }
  
  const visibleCameras = cameraFeeds.slice(0, getCameraCount());
  
  return (
    <div className="p-4">
      <div className={`grid ${getGridClassName()} gap-4`}>
        {visibleCameras.map((camera) => (
          <div key={camera.id} className="min-h-[200px]">
            <Card className="h-full">
              <div className="p-2 border-b bg-muted/30 flex justify-between items-center">
                <div className="flex items-center">
                  <Camera className="mr-2 text-avianet-red" size={16} />
                  <span className="text-sm font-medium">{camera.name}</span>
                </div>
                <span className="text-xs bg-black/10 py-1 px-2 rounded-full">
                  {streamType.toUpperCase()} STREAM
                </span>
              </div>
              <div className="p-2">
                <VideoFeed
                  initialVideoUrl={camera.streamUrl[streamType]}
                  autoStart={true}
                  showControls={false}
                  camera={camera}
                />
              </div>
            </Card>
          </div>
        ))}
      </div>
    </div>
  );
};

export default MultiCameraGrid;
