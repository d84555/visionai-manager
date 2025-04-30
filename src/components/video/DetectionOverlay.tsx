
import React, { useEffect, useState } from 'react';
import { Detection } from '@/services/EdgeAIInference';
import { extractBboxCoordinates, getModelColor, canSafelyRenderDetection } from '@/utils/detectionUtils';

interface DetectionOverlayProps {
  detections: Detection[];
  minimal?: boolean;
}

export const DetectionOverlay: React.FC<DetectionOverlayProps> = ({ detections, minimal = false }) => {
  const [visibleDetections, setVisibleDetections] = useState<Detection[]>([]);
  
  // Process detections when they change
  useEffect(() => {
    try {
      if (detections && detections.length > 0) {
        console.log(`DetectionOverlay received ${detections.length} detections`);
        
        // Log detection format for first detection
        if (detections[0]) {
          console.log("First detection sample:", JSON.stringify(detections[0]));
        }
        
        // Filter out any detections that can't be safely rendered
        const safeDetections = detections.filter(det => {
          try {
            return canSafelyRenderDetection(det);
          } catch (err) {
            console.error("Invalid detection format:", err, det);
            return false;
          }
        });
        
        // Sort by confidence before limiting
        const sortedDetections = safeDetections.sort((a, b) => 
          (b.confidence || 0) - (a.confidence || 0)
        );
        
        // Limit to max 50 detections to prevent rendering issues
        const limitedDetections = sortedDetections.slice(0, 50);
        setVisibleDetections(limitedDetections);
        
        console.log(`Filtered to ${limitedDetections.length} safe detections for rendering`);
      } else {
        setVisibleDetections([]);
      }
    } catch (error) {
      console.error("Error processing detections:", error);
      // Safely set empty array on error to prevent UI crashes
      setVisibleDetections([]);
    }
  }, [detections]);
  
  // Make sure we have valid detections
  if (!visibleDetections || visibleDetections.length === 0) {
    return null;
  }

  // Get the video element to determine actual dimensions
  try {
    const videoElement = document.querySelector('video');
    if (!videoElement) {
      console.log("No video element found for overlay");
      return null;
    }
    
    // Get actual display dimensions of the video element
    const videoBounds = videoElement.getBoundingClientRect();
    const displayWidth = videoBounds.width;
    const displayHeight = videoBounds.height;
    
    return (
      <>
        {visibleDetections.map((detection, index) => {
          // Wrap each detection rendering in its own try-catch to isolate failures
          try {
            // Pre-initialize all needed variables to avoid 'Cannot access before initialization' errors
            let displayX = 0;
            let displayY = 0;
            let displayBoxWidth = 0;
            let displayBoxHeight = 0;
            let borderColor = '#FF0000'; // Default red
            let validCoordinates = false;
            
            // Get the model color
            const modelName = detection.label ? detection.label.split(':')[0].toLowerCase() : '';
            borderColor = getModelColor(modelName);
            
            // Use our safe extraction utility to get coordinates
            const bbox = extractBboxCoordinates(detection);
            
            if (bbox.valid) {
              // Convert normalized values (0-1) to display pixel coordinates
              displayX = bbox.x1 * displayWidth;
              displayY = bbox.y1 * displayHeight;
              displayBoxWidth = (bbox.x2 - bbox.x1) * displayWidth;
              displayBoxHeight = (bbox.y2 - bbox.y1) * displayHeight;
              validCoordinates = true;
            }
            
            // Skip invalid or tiny bounding boxes
            if (!validCoordinates || displayBoxWidth < 1 || displayBoxHeight < 1 || 
                isNaN(displayX) || isNaN(displayY) || 
                isNaN(displayBoxWidth) || isNaN(displayBoxHeight)) {
              return null;
            }
            
            // Apply minimum size for very small detections
            const finalBoxWidth = Math.max(displayBoxWidth, 10);
            const finalBoxHeight = Math.max(displayBoxHeight, 10);
            
            // Create unique key for each detection
            const detectionKey = `detection-${detection.id || index}-${Date.now()}`;
            
            return (
              <div
                key={detectionKey}
                className="absolute border-2"
                style={{
                  left: `${displayX}px`,
                  top: `${displayY}px`,
                  width: `${finalBoxWidth}px`,
                  height: `${finalBoxHeight}px`,
                  borderColor: borderColor,
                  pointerEvents: 'none',
                  zIndex: 50,
                  transition: 'none' // Remove any transition that might cause lag
                }}
              >
                <span 
                  className={`absolute top-0 left-0 text-white ${
                    minimal ? 'text-[8px] px-1' : 'text-xs px-1 py-0.5'
                  } max-w-full overflow-hidden text-ellipsis whitespace-nowrap z-10`}
                  style={{ 
                    pointerEvents: 'none',
                    backgroundColor: borderColor
                  }}
                >
                  {minimal ? 
                    detection.label || detection.class || 'Object' : 
                    `${detection.label || detection.class || 'Object'} (${Math.round((detection.confidence || 0) * 100)}%)`
                  }
                </span>
              </div>
            );
          } catch (renderError) {
            // Log error but don't crash the entire UI
            console.error(`Error rendering detection ${index}:`, renderError);
            return null;
          }
        })}
      </>
    );
  } catch (error) {
    // Catch any global rendering errors
    console.error("Critical error rendering detection overlay:", error);
    return null;
  }
};
