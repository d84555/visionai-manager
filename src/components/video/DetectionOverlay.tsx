
import React, { useEffect, useState } from 'react';
import { extractBboxCoordinates, getModelColor, canSafelyRenderDetection } from '@/utils/detectionUtils';

interface Detection {
  id: string;
  label: string;
  confidence: number;
  bbox?: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    width?: number;
    height?: number;
  } | number[];
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  model?: string;
  class?: string;
}

interface DetectionOverlayProps {
  detections: Detection[];
  minimal?: boolean;
  videoRef?: React.RefObject<HTMLVideoElement>;
  inferenceLocation?: 'edge' | 'server' | null;
  inferenceTime?: number | null;
  actualFps?: number | null;
}

export const DetectionOverlay: React.FC<DetectionOverlayProps> = ({ 
  detections = [], 
  minimal = false,
  videoRef,
  inferenceLocation,
  inferenceTime,
  actualFps
}) => {
  const [visibleDetections, setVisibleDetections] = useState<Detection[]>([]);
  
  // Add logging for incoming detections
  useEffect(() => {
    console.log('DetectionOverlay received detections:', detections.length);
    if (detections.length > 0) {
      console.log('Sample detection:', detections[0]);
    }
    
    try {
      // Safety check for null/undefined detections
      if (!detections || !Array.isArray(detections)) {
        console.log('No valid detections array received');
        setVisibleDetections([]);
        return;
      }
      
      if (detections.length > 0) {
        // Filter out any detections that can't be safely rendered
        const safeDetections: Detection[] = [];
        
        for (let i = 0; i < detections.length; i++) {
          const det = detections[i];
          if (!det) continue;
          
          try {
            if (canSafelyRenderDetection(det)) {
              safeDetections.push(det);
            } else {
              console.log('Skipping unsafe detection:', det);
            }
          } catch (err) {
            console.error("Invalid detection format:", err);
          }
        }
        
        console.log(`Filtered to ${safeDetections.length} safe detections`);
        
        // Sort by confidence
        const sortedDetections = [...safeDetections];
        sortedDetections.sort((a, b) => {
          // Initialize confidence values safely
          const confA = typeof a.confidence === 'number' ? a.confidence : 0;
          const confB = typeof b.confidence === 'number' ? b.confidence : 0;
          return confB - confA; 
        });
        
        // Limit to max 50 detections
        const limitedDetections = sortedDetections.slice(0, 50);
        console.log(`Setting ${limitedDetections.length} visible detections`);
        setVisibleDetections(limitedDetections);
      } else {
        console.log('No detections to display');
        setVisibleDetections([]);
      }
    } catch (error) {
      console.error("Error processing detections:", error);
      setVisibleDetections([]);
    }
  }, [detections]);
  
  // Make sure we have valid detections
  if (!visibleDetections || visibleDetections.length === 0) {
    return null;
  }

  try {
    // Get the video element from ref or from DOM
    const videoElement = videoRef?.current || document.querySelector('video');
    if (!videoElement) {
      console.log("No video element found for overlay");
      return null;
    }
    
    // Get actual display dimensions
    const videoBounds = videoElement.getBoundingClientRect();
    const displayWidth = videoBounds.width;
    const displayHeight = videoBounds.height;
    
    console.log('Rendering detection overlay with dimensions:', displayWidth, displayHeight);
    
    return (
      <>
        {visibleDetections.map((detection, index) => {
          if (!detection) return null;
          
          // Create a stable unique key 
          const uniqueKey = `detection-${index}-${detection.id || ''}-${Date.now()}`;
          
          return (
            <DetectionBox 
              key={uniqueKey}
              detection={detection}
              displayWidth={displayWidth}
              displayHeight={displayHeight}
              minimal={minimal}
              index={index}
            />
          );
        })}
      </>
    );
  } catch (error) {
    console.error("Critical error rendering detection overlay:", error);
    return null;
  }
};

// Separate component for individual detection boxes
const DetectionBox: React.FC<{
  detection: Detection;
  displayWidth: number;
  displayHeight: number;
  minimal: boolean;
  index: number;
}> = ({ detection, displayWidth, displayHeight, minimal, index }) => {
  try {
    if (!detection) return null;
    
    // Pre-initialize all needed variables 
    let displayX = 0;
    let displayY = 0;
    let displayBoxWidth = 0;
    let displayBoxHeight = 0;
    let borderColor = '#FF0000'; 
    let validCoordinates = false;
    
    // Get the model name safely  
    const modelName = detection.model || 
      (detection.label ? detection.label.split(':')[0].toLowerCase() : '') || '';
      
    // Get color safely
    borderColor = getModelColor(modelName);
    
    // Use extraction utility for coordinates
    const bbox = extractBboxCoordinates(detection);
    
    if (bbox.valid) {
      // Convert normalized values to display pixels
      displayX = bbox.x1 * displayWidth;
      displayY = bbox.y1 * displayHeight;
      displayBoxWidth = (bbox.x2 - bbox.x1) * displayWidth;
      displayBoxHeight = (bbox.y2 - bbox.y1) * displayHeight;
      validCoordinates = true;
    }
    
    console.log(`Detection ${index} coordinates:`, {
      normalized: { x1: bbox.x1, y1: bbox.y1, x2: bbox.x2, y2: bbox.y2 },
      display: { x: displayX, y: displayY, width: displayBoxWidth, height: displayBoxHeight },
      valid: validCoordinates
    });
    
    // Skip invalid boxes
    if (!validCoordinates || 
        displayBoxWidth < 1 || 
        displayBoxHeight < 1 || 
        isNaN(displayX) || 
        isNaN(displayY) || 
        isNaN(displayBoxWidth) || 
        isNaN(displayBoxHeight)) {
      console.log(`Detection ${index} has invalid coordinates, skipping render`);
      return null;
    }
    
    // Apply minimum size
    const finalBoxWidth = Math.max(displayBoxWidth, 10);
    const finalBoxHeight = Math.max(displayBoxHeight, 10);
    
    // Prepare the label and confidence display
    let labelText = detection.label || detection.class || 'Object';
    let confidenceValue = 0;
    
    if (typeof detection.confidence === 'number') {
      confidenceValue = detection.confidence;
    }
    
    const roundedConfidence = Math.round(confidenceValue * 100);
    const displayLabel = minimal ? 
      labelText : 
      `${labelText} (${roundedConfidence}%)`;
    
    return (
      <div
        className="absolute border-2 pointer-events-none"
        style={{
          left: `${displayX}px`,
          top: `${displayY}px`,
          width: `${finalBoxWidth}px`,
          height: `${finalBoxHeight}px`,
          borderColor: borderColor,
          zIndex: 50
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
          {displayLabel}
        </span>
      </div>
    );
  } catch (renderError) {
    console.error(`Error rendering detection ${index}:`, renderError);
    return null;
  }
};
