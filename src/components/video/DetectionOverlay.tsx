
import React, { useEffect, useState } from 'react';
import { Detection } from '@/services/EdgeAIInference';

interface DetectionOverlayProps {
  detections: Detection[];
  minimal?: boolean;
}

export const DetectionOverlay: React.FC<DetectionOverlayProps> = ({ detections, minimal = false }) => {
  const [visibleDetections, setVisibleDetections] = useState<Detection[]>([]);
  
  // Debug: Log detections when they change
  useEffect(() => {
    if (detections?.length > 0) {
      console.log(`DetectionOverlay received ${detections.length} detections`);
      console.log('Sample detection:', detections[0]);
      
      // Limit number of detections to prevent performance issues
      // Sort by confidence before limiting
      const sortedDetections = [...detections].sort((a, b) => 
        (b.confidence || 0) - (a.confidence || 0)
      );
      
      // Limit to max 50 detections to prevent rendering issues
      const limitedDetections = sortedDetections.slice(0, 50);
      setVisibleDetections(limitedDetections);
    } else {
      setVisibleDetections([]);
    }
  }, [detections]);
  
  // Make sure we have valid detections
  if (!visibleDetections || visibleDetections.length === 0) {
    return null;
  }
  
  return (
    <>
      {visibleDetections.map((detection, index) => {
        // Check if detection has explicit x,y,width,height or bbox
        if (detection.x !== undefined && detection.y !== undefined && 
            detection.width !== undefined && detection.height !== undefined) {
          // Apply scaling factor for minimal view if needed
          const scaleFactor = minimal ? 0.5 : 1;
          
          return (
            <div
              key={`detection-${detection.id || index}`}
              className="absolute border-2 border-avianet-red"
              style={{
                left: `${detection.x * scaleFactor}px`,
                top: `${detection.y * scaleFactor}px`,
                width: `${detection.width * scaleFactor}px`,
                height: `${detection.height * scaleFactor}px`,
                pointerEvents: 'none',
                transition: 'none' // Remove any transition that might cause lag
              }}
            >
              <span 
                className={`absolute top-0 left-0 bg-avianet-red text-white ${
                  minimal ? 'text-[8px] px-1' : 'text-xs px-1 py-0.5'
                } max-w-full overflow-hidden text-ellipsis whitespace-nowrap`}
                style={{ pointerEvents: 'none' }}
              >
                {minimal ? 
                  detection.class || detection.label || 'Object' : 
                  `${detection.class || detection.label || 'Object'} (${(detection.confidence * 100).toFixed(0)}%)`
                }
              </span>
            </div>
          );
        } 
        // Use bbox format from inference API
        else if (detection.bbox && detection.bbox.length === 4) {
          // Apply scaling factor for minimal view if needed
          const scaleFactor = minimal ? 0.5 : 1;
          
          // Get normalized coordinates [x1, y1, x2, y2]
          const [x1, y1, x2, y2] = detection.bbox;
          
          // Calculate dimensions for video display
          const videoElement = document.querySelector('video');
          const videoWidth = videoElement?.videoWidth || 640;
          const videoHeight = videoElement?.videoHeight || 360;
          
          // Get the actual video display size
          const videoBounds = videoElement?.getBoundingClientRect();
          const containerWidth = videoBounds?.width || videoWidth;
          const containerHeight = videoBounds?.height || videoHeight;
          
          // Convert normalized coordinates to pixel values
          const x = x1 * containerWidth;
          const y = y1 * containerHeight;
          const width = (x2 - x1) * containerWidth;
          const height = (y2 - y1) * containerHeight;
          
          // Skip invalid bounding boxes with zero width/height
          if (width <= 1 || height <= 1) {
            return null;
          }
          
          return (
            <div
              key={`detection-${detection.id || index}`}
              className="absolute border-2 border-avianet-red"
              style={{
                left: `${x * scaleFactor}px`,
                top: `${y * scaleFactor}px`,
                width: `${width * scaleFactor}px`,
                height: `${height * scaleFactor}px`,
                pointerEvents: 'none',
                transition: 'none' // Remove any transition that might cause lag
              }}
            >
              <span 
                className={`absolute top-0 left-0 bg-avianet-red text-white ${
                  minimal ? 'text-[8px] px-1' : 'text-xs px-1 py-0.5'
                } max-w-full overflow-hidden text-ellipsis whitespace-nowrap z-10`}
                style={{ pointerEvents: 'none' }}
              >
                {minimal ? 
                  detection.label || detection.class || 'Object' : 
                  `${detection.label || detection.class || 'Object'} (${(detection.confidence * 100).toFixed(0)}%)`
                }
              </span>
            </div>
          );
        }
        
        console.warn("Invalid detection format received:", detection);
        return null;
      })}
    </>
  );
};
