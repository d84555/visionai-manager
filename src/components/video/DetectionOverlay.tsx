
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
      
      // Log first few detections to debug bbox format
      const sampleDetections = detections.slice(0, 3);
      console.log("Sample detections:", sampleDetections);
      
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
  
  // Get video dimensions - source dimensions and display dimensions
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
        
        // CASE 1: Handle YOLO-style center+dimensions format
        // This is for models that output (center_x, center_y, width, height)
        if (detection.x !== undefined && detection.y !== undefined && 
            detection.width !== undefined && detection.height !== undefined) {
          
          // First check if these are already pixel values or normalized values (0-1)
          const isNormalized = detection.x >= 0 && detection.x <= 1 && 
                              detection.y >= 0 && detection.y <= 1 && 
                              detection.width >= 0 && detection.width <= 1 && 
                              detection.height >= 0 && detection.height <= 1;
          
          // If values are normalized (0-1), convert to actual video pixel space
          let centerX = detection.x;
          let centerY = detection.y;
          let boxWidth = detection.width;
          let boxHeight = detection.height;
          
          if (isNormalized) {
            centerX *= videoWidth;
            centerY *= videoHeight;
            boxWidth *= videoWidth;
            boxHeight *= videoHeight;
          }
          
          // Convert from center coordinates to top-left coordinates for display
          const x = centerX - (boxWidth / 2);
          const y = centerY - (boxHeight / 2);
          
          // Calculate display coordinates from video coordinates
          const displayX = (x / videoWidth) * displayWidth;
          const displayY = (y / videoHeight) * displayHeight;
          const displayBoxWidth = (boxWidth / videoWidth) * displayWidth;
          const displayBoxHeight = (boxHeight / videoHeight) * displayHeight;
          
          console.log(`Detection ${index}: Center format [${centerX.toFixed(1)}, ${centerY.toFixed(1)}, ${boxWidth.toFixed(1)}, ${boxHeight.toFixed(1)}] -> Display [${displayX.toFixed(1)}, ${displayY.toFixed(1)}, ${displayBoxWidth.toFixed(1)}, ${displayBoxHeight.toFixed(1)}]`);
          
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
          
          // Check if these are normalized coordinates (0-1)
          const isNormalized = x1 >= 0 && x1 <= 1 && y1 >= 0 && y1 <= 1 && 
                              x2 >= 0 && x2 <= 1 && y2 >= 0 && y2 <= 1;
          
          // Convert to pixel values if normalized
          let pixelX1, pixelY1, pixelX2, pixelY2;
          
          if (isNormalized) {
            pixelX1 = x1 * videoWidth;
            pixelY1 = y1 * videoHeight;
            pixelX2 = x2 * videoWidth;
            pixelY2 = y2 * videoHeight;
          } else {
            // Assume these are already pixel values
            pixelX1 = x1;
            pixelY1 = y1;
            pixelX2 = x2;
            pixelY2 = y2;
          }
          
          // Calculate width and height
          const boxWidth = pixelX2 - pixelX1;
          const boxHeight = pixelY2 - pixelY1;
          
          // Calculate display coordinates
          const displayX = (pixelX1 / videoWidth) * displayWidth;
          const displayY = (pixelY1 / videoHeight) * displayHeight;
          const displayBoxWidth = (boxWidth / videoWidth) * displayWidth;
          const displayBoxHeight = (boxHeight / videoHeight) * displayHeight;
          
          console.log(`Detection ${index}: bbox [${pixelX1.toFixed(1)},${pixelY1.toFixed(1)},${pixelX2.toFixed(1)},${pixelY2.toFixed(1)}] -> Display [${displayX.toFixed(1)},${displayY.toFixed(1)}, ${displayBoxWidth.toFixed(1)}x${displayBoxHeight.toFixed(1)}]`);
          
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
