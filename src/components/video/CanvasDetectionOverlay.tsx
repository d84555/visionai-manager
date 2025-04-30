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

export const CanvasDetectionOverlay: React.FC<CanvasDetectionOverlayProps> = ({ 
  detections = [], 
  videoRef, 
  minimal = false 
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Log detections received by canvas overlay
  useEffect(() => {
    console.log(`CanvasDetectionOverlay received ${detections.length} detections`);
    if (detections.length > 0) {
      console.log('First detection:', detections[0]);
    }
  }, [detections]);

  // Main effect for drawing detections
  useEffect(() => {
    // IMPORTANT: Pre-initialize all variables to avoid temporal dead zone issues
    const canvas = canvasRef.current;
    const video = videoRef.current;
    
    if (!canvas || !video) {
      console.log('Canvas or video ref not available');
      return;
    }
    
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      console.error('Failed to get canvas context');
      return;
    }
    
    // Function to update canvas dimensions
    const updateCanvasDimensions = () => {
      if (!canvas || !video) return;
      
      // Get video dimensions - using separate variables to avoid TDZ
      const videoWidth = video.videoWidth;
      const videoHeight = video.videoHeight;
      const rect = video.getBoundingClientRect();
      const width = rect.width;
      const height = rect.height;
      
      console.log('Updating canvas dimensions:', { width, height, videoWidth, videoHeight });
      
      if (width && height) {
        canvas.width = width;
        canvas.height = height;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        
        // Redraw detections when dimensions change
        drawDetections();
      }
    };
    
    // Function to draw all detections
    const drawDetections = () => {
      if (!ctx || !canvas) return;
      
      // Clear canvas first
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Safety check for detections
      if (!Array.isArray(detections) || detections.length === 0) {
        console.log('No detections to draw on canvas');
        return;
      }
      
      console.log(`Drawing ${detections.length} detections on canvas`);
      
      // Draw each detection with proper error handling
      for (let i = 0; i < detections.length; i++) {
        try {
          const detection = detections[i];
          if (!detection) continue;
          
          // Initialize ALL variables before any calculations
          let canvasX = 0;
          let canvasY = 0;
          let canvasWidth = 0;
          let canvasHeight = 0;
          let color = 'red';
          let validCoordinates = false;
          
          // Get model name safely without destructuring
          const modelName = detection.model || detection.label || '';
          color = getModelColor(modelName);
          
          // Extract bbox coordinates safely
          const bbox = extractBboxCoordinates(detection);
          
          if (bbox.valid) {
            // Convert normalized coordinates to canvas pixels
            canvasX = bbox.x1 * canvas.width;
            canvasY = bbox.y1 * canvas.height;
            canvasWidth = (bbox.x2 - bbox.x1) * canvas.width;
            canvasHeight = (bbox.y2 - bbox.y1) * canvas.height;
            validCoordinates = true;
            
            console.log(`Detection ${i} canvas coordinates:`, {
              x: canvasX, 
              y: canvasY, 
              width: canvasWidth, 
              height: canvasHeight
            });
          }
          
          // Skip invalid boxes
          if (!validCoordinates || canvasWidth < 1 || canvasHeight < 1 || 
              isNaN(canvasX) || isNaN(canvasY) || isNaN(canvasWidth) || isNaN(canvasHeight)) {
            console.log(`Detection ${i} has invalid canvas coordinates, skipping`);
            continue;
          }
          
          // Draw bounding box
          ctx.strokeStyle = color;
          ctx.lineWidth = 2;
          ctx.strokeRect(canvasX, canvasY, canvasWidth, canvasHeight);
          
          // Draw label for non-minimal mode
          if (!minimal) {
            // Prepare label text - avoid destructuring entirely
            let labelText = detection.label || 'Unknown';
            let confidenceValue = 0;
            if (typeof detection.confidence === 'number') {
              confidenceValue = detection.confidence;
            }
            const roundedConfidence = Math.round(confidenceValue * 100);
            labelText = `${labelText} (${roundedConfidence}%)`;
            
            // Draw label background
            ctx.fillStyle = color;
            const textWidth = ctx.measureText(labelText).width;
            const textHeight = 20; // Approximate height
            ctx.fillRect(
              canvasX, 
              canvasY - textHeight, 
              textWidth + 10, 
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
          console.error('Error drawing detection:', error);
          // Continue with next detection
        }
      }
    };
    
    // Initial setup and event handlers
    updateCanvasDimensions();
    window.addEventListener('resize', updateCanvasDimensions);
    
    // Draw detections immediately
    drawDetections();
    
    // Cleanup
    return () => {
      window.removeEventListener('resize', updateCanvasDimensions);
    };
  }, [detections, videoRef, minimal]);
  
  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none"
      style={{ zIndex: 10 }}
      data-testid="detection-canvas"
    />
  );
};
