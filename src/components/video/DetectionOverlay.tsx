
import React, { useEffect, useState } from 'react';
import { Detection } from '@/services/EdgeAIInference';

interface DetectionOverlayProps {
  detections: Detection[];
  minimal?: boolean;
}

export const DetectionOverlay: React.FC<DetectionOverlayProps> = ({ detections, minimal = false }) => {
  const [visibleDetections, setVisibleDetections] = useState<Detection[]>([]);
  
  // Process detections when they change
  useEffect(() => {
    if (detections?.length > 0) {
      console.log(`DetectionOverlay received ${detections.length} detections`);
      
      // Enhanced logging for the first detection to understand its format
      if (detections[0]) {
        const firstDet = detections[0];
        console.log("%c Detection Format Analysis:", "background: #27ae60; color: white; padding: 5px;");
        console.log("First detection:", firstDet);
        
        // Check coordinate format type
        const hasCenterX = firstDet.x !== undefined;
        const hasCenterY = firstDet.y !== undefined;
        const hasBbox = Array.isArray(firstDet.bbox) && firstDet.bbox.length === 4;
        
        console.log(`Detection format: ${(hasCenterX && hasCenterY) ? 'Center coordinates' : ''} ${hasBbox ? 'Bbox coordinates' : ''}`);
        
        if (hasCenterX && hasCenterY) {
          const centerX = firstDet.x;
          const centerY = firstDet.y;
          const width = firstDet.width || 0;
          const height = firstDet.height || 0;
          
          console.log(`Center format values: x=${centerX}, y=${centerY}, width=${width}, height=${height}`);
          // Determine if normalized or absolute
          const isNormalized = centerX >= 0 && centerX <= 1 && centerY >= 0 && centerY <= 1;
          console.log(`Center coordinates appear to be: ${isNormalized ? 'NORMALIZED (0-1)' : 'ABSOLUTE PIXELS'}`);
        }
        
        if (hasBbox) {
          console.log(`Bbox values: [${firstDet.bbox.join(', ')}]`);
          // Determine if normalized or absolute
          const allInRange = firstDet.bbox.every(val => val >= 0 && val <= 1);
          console.log(`Bbox coordinates appear to be: ${allInRange ? 'NORMALIZED (0-1)' : 'ABSOLUTE PIXELS'}`);
        }
      }
      
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
  
  // Get video dimensions - actual display dimensions
  const videoBounds = videoElement.getBoundingClientRect();
  const displayWidth = videoBounds.width;
  const displayHeight = videoBounds.height;
  
  console.log(`Video display dimensions: ${displayWidth}x${displayHeight}`);
  
  return (
    <>
      {visibleDetections.map((detection, index) => {
        // Apply scaling factor for minimal view if needed
        const scaleFactor = minimal ? 0.5 : 1;
        
        // CASE 1: Handle YOLO-style center+dimensions format
        if (detection.x !== undefined && detection.y !== undefined && 
            detection.width !== undefined && detection.height !== undefined) {
          
          // Get center coordinates
          const centerX = detection.x;
          const centerY = detection.y;
          
          // Assume values are normalized (0-1) as confirmed from model output
          // Convert normalized values to display pixel coordinates
          const displayCenterX = centerX * displayWidth;
          const displayCenterY = centerY * displayHeight;
          const displayBoxWidth = detection.width * displayWidth;
          const displayBoxHeight = detection.height * displayHeight;
          
          // Convert from center coordinates to top-left coordinates for display
          const displayX = displayCenterX - (displayBoxWidth / 2);
          const displayY = displayCenterY - (displayBoxHeight / 2);
          
          if (index === 0) {
            console.log(`First detection: normalized(${centerX.toFixed(3)}, ${centerY.toFixed(3)}, ${detection.width.toFixed(3)}, ${detection.height.toFixed(3)}) -> ` +
                       `display pixels(${displayX.toFixed(1)}, ${displayY.toFixed(1)}, ${displayBoxWidth.toFixed(1)}, ${displayBoxHeight.toFixed(1)})`);
          }
          
          // Skip invalid or tiny bounding boxes
          if (displayBoxWidth < 1 || displayBoxHeight < 1 || isNaN(displayBoxWidth) || 
              isNaN(displayBoxHeight) || isNaN(displayX) || isNaN(displayY)) {
            console.log(`Skipping detection ${index} due to invalid dimensions`);
            return null;
          }
          
          // Apply minimum size for very small detections
          let finalBoxWidth = displayBoxWidth;
          let finalBoxHeight = displayBoxHeight;
          
          if (finalBoxWidth < 10) finalBoxWidth = 10;
          if (finalBoxHeight < 10) finalBoxHeight = 10;
          
          return (
            <div
              key={`detection-${detection.id || index}`}
              className="absolute border-2 border-avianet-red"
              style={{
                left: `${displayX * scaleFactor}px`,
                top: `${displayY * scaleFactor}px`,
                width: `${finalBoxWidth * scaleFactor}px`,
                height: `${finalBoxHeight * scaleFactor}px`,
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
                  `${detection.label || detection.class || 'Object'} (${Math.round((detection.confidence || 0) * 100)}%)`
                }
              </span>
            </div>
          );
        }
        
        // CASE 2: Handle bbox format [x1, y1, x2, y2]
        else if (detection.bbox && detection.bbox.length === 4) {
          // Get coordinates [x1, y1, x2, y2]
          const [x1, y1, x2, y2] = detection.bbox;
          
          // Assume these are normalized coordinates (0-1)
          // Convert normalized values to display pixel coordinates
          const displayX = x1 * displayWidth;
          const displayY = y1 * displayHeight;
          const displayBoxWidth = (x2 - x1) * displayWidth;
          const displayBoxHeight = (y2 - y1) * displayHeight;
          
          if (index === 0) {
            console.log(`First detection bbox: normalized[${x1.toFixed(3)}, ${y1.toFixed(3)}, ${x2.toFixed(3)}, ${y2.toFixed(3)}] -> ` +
                       `display pixels[${displayX.toFixed(1)}, ${displayY.toFixed(1)}, ${displayBoxWidth.toFixed(1)}, ${displayBoxHeight.toFixed(1)}]`);
          }
          
          // Skip invalid or tiny bounding boxes
          if (displayBoxWidth < 1 || displayBoxHeight < 1 || isNaN(displayBoxWidth) || 
              isNaN(displayBoxHeight) || isNaN(displayX) || isNaN(displayY)) {
            console.log(`Skipping detection ${index} due to invalid dimensions`);
            return null;
          }
          
          // Apply minimum size for very small detections
          let finalBoxWidth = displayBoxWidth;
          let finalBoxHeight = displayBoxHeight;
          
          if (finalBoxWidth < 10) finalBoxWidth = 10;
          if (finalBoxHeight < 10) finalBoxHeight = 10;
          
          return (
            <div
              key={`detection-${detection.id || index}`}
              className="absolute border-2 border-avianet-red"
              style={{
                left: `${displayX * scaleFactor}px`,
                top: `${displayY * scaleFactor}px`,
                width: `${finalBoxWidth * scaleFactor}px`,
                height: `${finalBoxHeight * scaleFactor}px`,
                pointerEvents: 'none',
                zIndex: 50,
                transition: 'none'
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
                  `${detection.label || detection.class || 'Object'} (${Math.round((detection.confidence || 0) * 100)}%)`
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
