
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
          // Pre-initialize all variables to avoid "Cannot access before initialization" errors
          let canvasX: number | null = null;
          let canvasY: number | null = null;
          let canvasWidth: number | null = null;
          let canvasHeight: number | null = null;
          let color: string = 'red'; // Default color
          
          // Get color based on model or class name
          const modelName = detection.model || detection.label.toLowerCase();
          color = modelColors[modelName] || modelColors['default'];
          if (!modelColors[modelName]) {
            color = getColorForModel(modelName);
            modelColors[modelName] = color;
          }
          
          // Determine which format we're dealing with and calculate display coordinates
          if (detection.x !== undefined && detection.y !== undefined && 
              detection.width !== undefined && detection.height !== undefined) {
            // Center format with x,y,width,height
            const centerX = detection.x;
            const centerY = detection.y;
            const width = detection.width;
            const height = detection.height;
            
            const halfWidth = width / 2;
            const halfHeight = height / 2;
            
            // Convert normalized values to canvas pixels
            canvasX = (centerX - halfWidth) * canvas.width;
            canvasY = (centerY - halfHeight) * canvas.height;
            canvasWidth = width * canvas.width;
            canvasHeight = height * canvas.height;
          }
          else if (detection.bbox) {
            // Initialize values to safe defaults
            let x1 = 0;
            let y1 = 0;
            let x2 = 0;
            let y2 = 0;
            
            // Array format [x1, y1, x2, y2]
            if (Array.isArray(detection.bbox)) {
              const bbox = detection.bbox;
              
              // Access by index instead of destructuring
              if (bbox.length >= 4) {
                x1 = bbox[0];
                y1 = bbox[1];
                x2 = bbox[2];
                y2 = bbox[3];
              } else {
                console.warn('Invalid bbox array length:', bbox.length);
                return; // Skip this detection
              }
            } 
            // Object format with x1,y1,x2,y2
            else if (typeof detection.bbox === 'object' && detection.bbox !== null) {
              const bbox = detection.bbox;
              
              // Check properties exist before using them
              if (!('x1' in bbox) || !('y1' in bbox) || !('x2' in bbox) || !('y2' in bbox)) {
                console.warn('Incomplete bbox object', bbox);
                return; // Skip this detection
              }
              
              // Safe property access
              x1 = bbox.x1;
              y1 = bbox.y1;
              x2 = bbox.x2;
              y2 = bbox.y2;
            } else {
              console.warn('Invalid bbox format');
              return; // Skip this detection
            }
            
            // Convert normalized values to canvas pixels
            canvasX = x1 * canvas.width;
            canvasY = y1 * canvas.height;
            canvasWidth = (x2 - x1) * canvas.width;
            canvasHeight = (y2 - y1) * canvas.height;
          } else {
            console.warn('Invalid detection format:', detection);
            return; // Skip this detection
          }
          
          // Skip invalid boxes
          if (canvasX === null || canvasY === null || canvasWidth === null || canvasHeight === null || 
              canvasWidth < 1 || canvasHeight < 1 || 
              isNaN(canvasX) || isNaN(canvasY) || isNaN(canvasWidth) || isNaN(canvasHeight)) {
            return; // Skip drawing this detection
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
