
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
          
          // Handle very small bounding boxes - these are likely normalized coordinates between 0-1
          // For values like [0.000, 0.002, 0.030, 0.063] seen in the console
          let boxX, boxY, boxWidth, boxHeight;
          
          // Check if the values are likely normalized (all values between 0-1)
          const isNormalizedFormat = x1 >= 0 && x1 <= 1 && y1 >= 0 && y1 <= 1 && 
                                    x2 >= 0 && x2 <= 1 && y2 >= 0 && y2 <= 1;
          
          if (isNormalizedFormat) {
            // Convert normalized coordinates to pixel values
            boxX = x1 * displayWidth;
            boxY = y1 * displayHeight;
            boxWidth = (x2 - x1) * displayWidth;
            boxHeight = (y2 - y1) * displayHeight;
            
            console.log(`Detection ${index}: Normalized coords [${x1.toFixed(3)}, ${y1.toFixed(3)}, ${x2.toFixed(3)}, ${y2.toFixed(3)}] → ${boxX.toFixed(1)}×${boxY.toFixed(1)} ${boxWidth.toFixed(1)}×${boxHeight.toFixed(1)}`);
          } else {
            // Assume these are already pixel values
            boxX = x1;
            boxY = y1;
            boxWidth = x2 - x1;
            boxHeight = y2 - y1;
            
            console.log(`Detection ${index}: Pixel coords [${x1.toFixed(1)}, ${y1.toFixed(1)}, ${x2.toFixed(1)}, ${y2.toFixed(1)}] → ${boxWidth.toFixed(1)}×${boxHeight.toFixed(1)}`);
          }
          
          // Skip invalid or tiny bounding boxes
          if (boxWidth < 1 || boxHeight < 1) {
            console.log(`Skipping detection ${index} due to invalid dimensions: ${boxWidth.toFixed(1)}×${boxHeight.toFixed(1)}`);
            return null;
          }
          
          // Apply minimum size for very small detections to make them visible
          if (boxWidth < 10) boxWidth = 10;
          if (boxHeight < 10) boxHeight = 10;
          
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
          
          console.log(`Detection ${index} (x,y,w,h): ${detection.x}×${detection.y} ${detection.width}×${detection.height} → ${boxX.toFixed(1)}×${boxY.toFixed(1)} ${boxWidth.toFixed(1)}×${boxHeight.toFixed(1)}`);
          
          // Apply minimum size for very small detections
          let finalWidth = boxWidth;
          let finalHeight = boxHeight;
          
          if (finalWidth < 10) finalWidth = 10;
          if (finalHeight < 10) finalHeight = 10;
          
          return (
            <div
              key={`detection-${detection.id || index}`}
              className="absolute border-2 border-avianet-red"
              style={{
                left: `${boxX * scaleFactor}px`,
                top: `${boxY * scaleFactor}px`,
                width: `${finalWidth * scaleFactor}px`,
                height: `${finalHeight * scaleFactor}px`,
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
