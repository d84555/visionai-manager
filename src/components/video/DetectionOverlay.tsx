
import React from 'react';
import { Detection } from '@/services/EdgeAIInference';

interface DetectionOverlayProps {
  detections: Detection[];
  minimal?: boolean;
}

export const DetectionOverlay: React.FC<DetectionOverlayProps> = ({ detections, minimal = false }) => {
  return (
    <>
      {detections.map((detection) => (
        <div
          key={detection.id}
          className="absolute border-2 border-avianet-red"
          style={{
            left: `${detection.x * (minimal ? 0.5 : 1)}px`,
            top: `${detection.y * (minimal ? 0.5 : 1)}px`,
            width: `${detection.width * (minimal ? 0.5 : 1)}px`,
            height: `${detection.height * (minimal ? 0.5 : 1)}px`
          }}
        >
          <span 
            className={`absolute top-0 left-0 bg-avianet-red text-white ${
              minimal ? 'text-[8px] px-1' : 'text-xs px-1 py-0.5'
            } max-w-full overflow-hidden text-ellipsis`}
          >
            {minimal ? 
              detection.class :
              `${detection.class} (${(detection.confidence * 100).toFixed(0)}%)`
            }
          </span>
        </div>
      ))}
    </>
  );
};
