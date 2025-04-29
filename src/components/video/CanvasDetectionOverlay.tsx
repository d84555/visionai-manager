
import React, { useRef, useEffect } from 'react';
import { Detection } from '@/services/EdgeAIInference';

interface CanvasDetectionOverlayProps {
  detections: Detection[];
  videoRef: React.RefObject<HTMLVideoElement>;
  minimal?: boolean;
}

export const CanvasDetectionOverlay: React.FC<CanvasDetectionOverlayProps> = ({ 
  detections, 
  videoRef,
  minimal = false 
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // Draw detections on canvas when they change or video dimensions change
  useEffect(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    
    if (!canvas || !video) return;
    
    // Set canvas dimensions to match video display size
    const updateCanvasDimensions = () => {
      const videoBounds = video.getBoundingClientRect();
      canvas.width = videoBounds.width;
      canvas.height = videoBounds.height;
    };
    
    // Initial size update
    updateCanvasDimensions();
    
    // Redraw when dimensions change
    const resizeObserver = new ResizeObserver(() => {
      updateCanvasDimensions();
      drawDetections();
    });
    
    resizeObserver.observe(video);
    
    const drawDetections = () => {
      if (!canvas || !video) return;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      
      // Clear previous drawings
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      if (detections.length === 0) return;
      
      // Get dimensions
      const displayWidth = canvas.width;
      const displayHeight = canvas.height;
      
      // Sort by confidence for consistent rendering order
      const sortedDetections = [...detections].sort((a, b) => 
        (b.confidence || 0) - (a.confidence || 0)
      );
      
      // Draw each detection
      sortedDetections.forEach(detection => {
        let displayX, displayY, displayBoxWidth, displayBoxHeight;
        
        // Process center+dimensions format
        if (detection.x !== undefined && detection.y !== undefined && 
            detection.width !== undefined && detection.height !== undefined) {
          
          // Convert normalized values to display pixel coordinates
          const displayCenterX = detection.x * displayWidth;
          const displayCenterY = detection.y * displayHeight;
          displayBoxWidth = detection.width * displayWidth;
          displayBoxHeight = detection.height * displayHeight;
          
          // Convert from center to top-left
          displayX = displayCenterX - (displayBoxWidth / 2);
          displayY = displayCenterY - (displayBoxHeight / 2);
        }
        // Process bbox format [x1, y1, x2, y2]
        else if (detection.bbox && detection.bbox.length === 4) {
          const [x1, y1, x2, y2] = detection.bbox;
          
          // Convert normalized values to display pixel coordinates
          displayX = x1 * displayWidth;
          displayY = y1 * displayHeight;
          displayBoxWidth = (x2 - x1) * displayWidth;
          displayBoxHeight = (y2 - y1) * displayHeight;
        } 
        else {
          return; // Skip invalid format
        }
        
        // Skip invalid or tiny bounding boxes
        if (displayBoxWidth < 1 || displayBoxHeight < 1 || isNaN(displayBoxWidth) || 
            isNaN(displayBoxHeight) || isNaN(displayX) || isNaN(displayY)) {
          return;
        }
        
        // Apply minimum size for very small detections
        let finalBoxWidth = displayBoxWidth;
        let finalBoxHeight = displayBoxHeight;
        
        if (finalBoxWidth < 10) finalBoxWidth = 10;
        if (finalBoxHeight < 10) finalBoxHeight = 10;
        
        // Draw rectangle for bounding box
        ctx.strokeStyle = '#e53935'; // avianet-red equivalent
        ctx.lineWidth = 2;
        ctx.strokeRect(displayX, displayY, finalBoxWidth, finalBoxHeight);
        
        // Draw label background
        const label = detection.label || detection.class || 'Object';
        const confidenceText = minimal ? '' : ` (${Math.round((detection.confidence || 0) * 100)}%)`;
        const text = `${label}${confidenceText}`;
        
        ctx.font = minimal ? '10px Arial' : '12px Arial';
        const textMetrics = ctx.measureText(text);
        const textWidth = textMetrics.width + 4;
        const textHeight = minimal ? 14 : 18;
        
        ctx.fillStyle = '#e53935'; // avianet-red background
        ctx.fillRect(displayX, displayY, textWidth, textHeight);
        
        // Draw label text
        ctx.fillStyle = '#ffffff'; // white text
        ctx.fillText(text, displayX + 2, displayY + (minimal ? 10 : 13));
      });
    };
    
    // Draw when detections change
    drawDetections();
    
    return () => {
      resizeObserver.disconnect();
    };
  }, [detections, videoRef, minimal]);
  
  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none"
      style={{ zIndex: 50 }}
    />
  );
};
