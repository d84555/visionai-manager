
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
      
      // Log first few detections to debug bbox format
      const sampleDetections = detections.slice(0, 3);
      console.log("Sample detections:", sampleDetections);
      
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

  // Get the video element to determine actual dimensions
  const videoElement = document.querySelector('video');
  if (!videoElement) {
    console.log("No video element found for overlay");
    return null;
  }
  
  const videoWidth = videoElement.videoWidth;
  const videoHeight = videoElement.videoHeight;
  const videoBounds = videoElement.getBoundingClientRect();
  const displayWidth = videoBounds.width;
  const displayHeight = videoBounds.height;
  
  console.log(`Video dimensions: ${videoWidth}x${videoHeight}, Display: ${displayWidth}x${displayHeight}`);
  
  return (
    <>
      {visibleDetections.map((detection, index) => {
        // Apply scaling factor for minimal view if needed
        const scaleFactor = minimal ? 0.5 : 1;
        
        // Use bbox format from inference API
        if (detection.bbox && detection.bbox.length === 4) {
          // Get normalized coordinates [x1, y1, x2, y2]
          const [x1, y1, x2, y2] = detection.bbox;
          
          // Check for unrealistically small bounding boxes (as seen in console)
          // If bbox values are all very small (like [0.001, 0.001, 0.001, 0.001]), 
          // we need to scale them up
          let boxX = x1 * displayWidth;
          let boxY = y1 * displayHeight;
          let boxWidth = (x2 - x1) * displayWidth;
          let boxHeight = (y2 - y1) * displayHeight;
          
          // Handle extremely small bounding boxes
          // If all values are less than 0.01, it's likely a preprocessing issue - apply fix
          if (x1 < 0.01 && y1 < 0.01 && x2 < 0.01 && y2 < 0.01) {
            // These appear to be coordinates in a different format (not normalized)
            // Scale to full display size - assume full frame detection since coordinates 
            // are too small to be useful
            boxX = 0;
            boxY = 0;
            boxWidth = displayWidth;
            boxHeight = displayHeight;
            console.log(`Detection ${index}: Extremely small values detected, using full frame`);
          }
          
          console.log(`Detection ${index}: [${x1.toFixed(3)}, ${y1.toFixed(3)}, ${x2.toFixed(3)}, ${y2.toFixed(3)}] → ${boxX.toFixed(1)}x${boxY.toFixed(1)} ${boxWidth.toFixed(1)}x${boxHeight.toFixed(1)}`);
          
          // Skip invalid or tiny bounding boxes (ones that remain too small even after scaling)
          if (boxWidth < 1 || boxHeight < 1) {
            return null;
          }
          
          return (
            <div
              key={`detection-${detection.id || index}`}
              className="absolute border-2 border-avianet-red"
              style={{
                left: `${boxX * scaleFactor}px`,
                top: `${boxY * scaleFactor}px`,
                width: `${boxWidth * scaleFactor}px`,
                height: `${boxHeight * scaleFactor}px`,
                pointerEvents: 'none',
                zIndex: 50,
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
                  `${detection.label || detection.class || 'Object'} (${Math.round(detection.confidence * 100)}%)`
                }
              </span>
            </div>
          );
        } 
        // Handle the explicit x,y,width,height format
        else if (detection.x !== undefined && detection.y !== undefined && 
                detection.width !== undefined && detection.height !== undefined) {
          
          // Scale to video display size
          const boxX = detection.x * displayWidth / videoWidth;
          const boxY = detection.y * displayHeight / videoHeight;
          const boxWidth = detection.width * displayWidth / videoWidth;
          const boxHeight = detection.height * displayHeight / videoHeight;
          
          console.log(`Detection ${index} (x,y,w,h): ${detection.x}x${detection.y} ${detection.width}x${detection.height} → ${boxX.toFixed(1)}x${boxY.toFixed(1)} ${boxWidth.toFixed(1)}x${boxHeight.toFixed(1)}`);
          
          return (
            <div
              key={`detection-${detection.id || index}`}
              className="absolute border-2 border-avianet-red"
              style={{
                left: `${boxX * scaleFactor}px`,
                top: `${boxY * scaleFactor}px`,
                width: `${boxWidth * scaleFactor}px`,
                height: `${boxHeight * scaleFactor}px`,
                pointerEvents: 'none',
                zIndex: 50,
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
                  `${detection.class || detection.label || 'Object'} (${Math.round(detection.confidence * 100)}%)`
                }
              </span>
            </div>
          );
        } 
        
        // Log invalid detection format
        console.warn("Invalid detection format received:", detection);
        return null;
      })}
    </>
  );
};
