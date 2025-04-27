
import React from 'react';
import { Detection } from '@/services/EdgeAIInference';

interface DetectionOverlayProps {
  detections: Detection[];
  minimal?: boolean;
}

export const DetectionOverlay: React.FC<DetectionOverlayProps> = ({ detections, minimal = false }) => {
  // Make sure we have valid detections
  if (!detections || detections.length === 0) {
    return null;
  }
  
  return (
    <>
      {detections.map((detection) => {
        // Ensure detection has valid coordinates
        if (detection.x === undefined || detection.y === undefined || 
            detection.width === undefined || detection.height === undefined) {
          console.warn("Invalid detection received:", detection);
          return null;
        }
        
        // Apply scaling factor for minimal view if needed
        const scaleFactor = minimal ? 0.5 : 1;
        
        return (
          <div
            key={detection.id}
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
                detection.class :
                `${detection.class} (${(detection.confidence * 100).toFixed(0)}%)`
              }
            </span>
          </div>
        );
      })}
    </>
  );
};
