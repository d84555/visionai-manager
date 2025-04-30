
import React, { useRef, useEffect } from 'react';
import { extractBboxCoordinates, getModelColor } from '@/utils/detectionUtils';

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
      console.log(`Drawing ${detections?.length || 0} detections on canvas ${canvas.width}x${canvas.height}`);
      
      // Safety check for detections
      if (!detections || detections.length === 0) {
        return;
      }
      
      // Draw each detection
      for (let index = 0; index < detections.length; index++) {
        try {
          const detection = detections[index];
          if (!detection) continue;
          
          // Pre-initialize all possible variables for safety
          let canvasX = 0;
          let canvasY = 0;
          let canvasWidth = 0;
          let canvasHeight = 0;
          let color = 'red'; // Default color
          let validCoordinates = false;
          
          // Get color based on model or class name
          const modelName = detection.model || detection.label || '';
          color = getModelColor(modelName);
          
          // Extract bbox coordinates safely using our utility
          const bbox = extractBboxCoordinates(detection);
          
          if (bbox.valid) {
            // Convert normalized values (0-1) to canvas pixels
            canvasX = bbox.x1 * canvas.width;
            canvasY = bbox.y1 * canvas.height;
            canvasWidth = (bbox.x2 - bbox.x1) * canvas.width;
            canvasHeight = (bbox.y2 - bbox.y1) * canvas.height;
            validCoordinates = true;
          }
          
          // Skip invalid boxes
          if (!validCoordinates || canvasWidth < 1 || canvasHeight < 1 || 
              isNaN(canvasX) || isNaN(canvasY) || isNaN(canvasWidth) || isNaN(canvasHeight)) {
            continue; // Skip drawing this detection
          }
          
          // Draw bounding box
          ctx.strokeStyle = color;
          ctx.lineWidth = 2;
          ctx.strokeRect(canvasX, canvasY, canvasWidth, canvasHeight);
          
          // Draw label for non-minimal mode
          if (!minimal) {
            // Prepare label text
            const labelText = detection.model 
              ? `${detection.label || 'Unknown'} (${Math.round((detection.confidence || 0) * 100)}%)`
              : `${detection.label || 'Unknown'} (${Math.round((detection.confidence || 0) * 100)}%)`;
            
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
          console.error('Error drawing detection:', error, detections[index]);
        }
      }
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
