
import React, { useRef, useEffect } from 'react';

interface BoundingBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  width?: number;
  height?: number;
}

interface Detection {
  id: string;
  label: string;
  confidence: number;
  bbox?: BoundingBox | number[];
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  model?: string;
}

interface CanvasDetectionOverlayProps {
  detections: Detection[];
  videoRef: React.RefObject<HTMLVideoElement>;
  minimal?: boolean;
}

// Generate a consistent color based on model name or label
const getColorForModel = (modelName: string): string => {
  // Simple hash function to generate a consistent color
  const hash = modelName.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  
  // Generate a hue value between 0 and 360 based on the hash
  const hue = hash % 360;
  
  // Use a high saturation and lightness for visibility
  return `hsl(${hue}, 100%, 50%)`;
};

// Model colors cache
const modelColors: Record<string, string> = {
  'helmet': 'red',
  'person': 'blue',
  'coverall': 'green',
  'vest': 'orange',
  'default': 'yellow'
};

export const CanvasDetectionOverlay: React.FC<CanvasDetectionOverlayProps> = ({ detections, videoRef, minimal = false }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    
    if (!canvas || !video) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Set canvas dimensions to match video
    const updateCanvasDimensions = () => {
      if (canvas && video) {
        const { videoWidth, videoHeight } = video;
        const { width, height } = video.getBoundingClientRect();
        
        if (width && height) {
          canvas.width = width;
          canvas.height = height;
          canvas.style.width = `${width}px`;
          canvas.style.height = `${height}px`;
          
          // Redraw detections when dimensions change
          drawDetections();
        }
      }
    };
    
    // Initial setup and on resize
    updateCanvasDimensions();
    window.addEventListener('resize', updateCanvasDimensions);
    
    // Clear existing drawings and draw new ones
    const drawDetections = () => {
      if (!ctx || !canvas) return;
      
      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Debug: Log dimensions and detection count
      console.log(`Drawing ${detections.length} detections on canvas ${canvas.width}x${canvas.height}`);
      
      if (detections.length === 0) {
        return;
      }
      
      // Draw each detection
      detections.forEach((detection) => {
        try {
          // Determine which format we're dealing with
          let x1, y1, x2, y2, width, height;
          
          // Process different bbox formats
          if (detection.bbox) {
            // Array format [x1, y1, x2, y2]
            if (Array.isArray(detection.bbox) && detection.bbox.length >= 4) {
              [x1, y1, x2, y2] = detection.bbox;
              width = x2 - x1;
              height = y2 - y1;
            } 
            // Object format with x1,y1,x2,y2
            else if (typeof detection.bbox === 'object') {
              ({ x1, y1, x2, y2 } = detection.bbox as BoundingBox);
              width = x2 - x1;
              height = y2 - y1;
            }
          } 
          // Center format with x,y,width,height
          else if (detection.x !== undefined && detection.y !== undefined && 
                  detection.width !== undefined && detection.height !== undefined) {
            const halfWidth = detection.width / 2;
            const halfHeight = detection.height / 2;
            x1 = detection.x - halfWidth;
            y1 = detection.y - halfHeight;
            x2 = detection.x + halfWidth;
            y2 = detection.y + halfHeight;
            width = detection.width;
            height = detection.height;
          }
          
          if (x1 === undefined || y1 === undefined || width === undefined || height === undefined) {
            console.warn('Invalid detection format:', detection);
            return; // Skip this detection
          }
          
          // Convert normalized coordinates to canvas pixels
          const canvasX = x1 * canvas.width;
          const canvasY = y1 * canvas.height;
          const canvasWidth = width * canvas.width;
          const canvasHeight = height * canvas.height;
          
          // Get color based on model or class name
          const modelName = detection.model || detection.label.toLowerCase();
          let color = modelColors[modelName] || modelColors['default'];
          if (!modelColors[modelName]) {
            color = getColorForModel(modelName);
            modelColors[modelName] = color;
          }
          
          // Draw bounding box
          ctx.strokeStyle = color;
          ctx.lineWidth = 2;
          ctx.strokeRect(canvasX, canvasY, canvasWidth, canvasHeight);
          
          // Draw label for non-minimal mode
          if (!minimal) {
            // Prepare label text
            const labelText = detection.model 
              ? `${detection.label} (${Math.round(detection.confidence * 100)}%)`
              : `${detection.label} (${Math.round(detection.confidence * 100)}%)`;
            
            // Draw label background
            ctx.fillStyle = color;
            const textMetrics = ctx.measureText(labelText);
            const textHeight = 20; // Approximate height
            ctx.fillRect(
              canvasX, 
              canvasY - textHeight, 
              textMetrics.width + 10, 
              textHeight
            );
            
            // Draw label text
            ctx.fillStyle = 'white';
            ctx.font = '14px Arial';
            ctx.fillText(
              labelText,
              canvasX + 5, 
              canvasY - 5
            );
          }
        } catch (error) {
          console.error('Error drawing detection:', error, detection);
        }
      });
    };
    
    // Draw immediately and whenever detections change
    drawDetections();
    
    return () => {
      window.removeEventListener('resize', updateCanvasDimensions);
    };
  }, [detections, videoRef, minimal]);
  
  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none"
      style={{ zIndex: 10 }}
    />
  );
};
