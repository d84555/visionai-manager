/**
 * Utility functions for working with detection objects
 */

// Common type for bounding box objects
export interface BoundingBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  width?: number;
  height?: number;
}

// Get a color based on the model name for consistent visualization
export function getModelColor(modelName: string): string {
  // Default color for unknown models
  if (!modelName) return '#FF0000'; // Red
  
  // Normalize the model name to handle case differences
  const normalizedName = modelName.toLowerCase();
  
  // Map of model names to colors
  const colorMap: Record<string, string> = {
    'coverall': '#FF4500', // Orange-red
    'helmet': '#1E90FF',   // Dodger blue
    'person': '#32CD32',   // Lime green
    'face': '#FFD700',     // Gold
    'mask': '#8A2BE2',     // Blue violet
    'vest': '#FF8C00',     // Dark orange
    'glove': '#00CED1',    // Dark turquoise
    'yolov8': '#FF0000',   // Red (default for YOLOv8)
    'default': '#FF0000'   // Default red
  };
  
  // Try to find an exact match first
  for (const [key, color] of Object.entries(colorMap)) {
    if (normalizedName === key) {
      return color;
    }
  }
  
  // Otherwise, check if the model name contains any of our keys
  for (const [key, color] of Object.entries(colorMap)) {
    if (normalizedName.includes(key)) {
      return color;
    }
  }
  
  // Return default color if no match
  return colorMap.default;
}

// Safely extract bbox coordinates from various detection format types
export function extractBboxCoordinates(detection: any): { 
  x1: number; 
  y1: number; 
  x2: number; 
  y2: number; 
  valid: boolean;
} {
  try {
    // Default result with invalid flag
    const result = {
      x1: 0,
      y1: 0,
      x2: 0,
      y2: 0,
      valid: false
    };
    
    // Handle YOLO-style center+dimensions format
    if (detection.x !== undefined && detection.y !== undefined && 
        detection.width !== undefined && detection.height !== undefined) {
      
      const centerX = detection.x;
      const centerY = detection.y;
      const width = detection.width;
      const height = detection.height;
      
      result.x1 = centerX - (width / 2);
      result.y1 = centerY - (height / 2);
      result.x2 = centerX + (width / 2);
      result.y2 = centerY + (height / 2);
      result.valid = true;
      return result;
    }
    
    // Handle bbox formats
    if (detection.bbox) {
      // Array format [x1, y1, x2, y2]
      if (Array.isArray(detection.bbox) && detection.bbox.length >= 4) {
        result.x1 = detection.bbox[0];
        result.y1 = detection.bbox[1];
        result.x2 = detection.bbox[2];
        result.y2 = detection.bbox[3];
        result.valid = true;
        return result;
      }
      
      // Object format with {x1, y1, x2, y2}
      if (typeof detection.bbox === 'object' && detection.bbox !== null) {
        const bbox = detection.bbox;
        if ('x1' in bbox && 'y1' in bbox && 'x2' in bbox && 'y2' in bbox) {
          result.x1 = bbox.x1;
          result.y1 = bbox.y1;
          result.x2 = bbox.x2;
          result.y2 = bbox.y2;
          result.valid = true;
          return result;
        }
      }
    }
    
    return result; // Returns with valid=false
  } catch (error) {
    console.error('Error extracting bounding box coordinates:', error);
    return {
      x1: 0,
      y1: 0,
      x2: 0,
      y2: 0,
      valid: false
    };
  }
}

// Validate and convert detection coordinates to display dimensions
export function convertToDisplayCoordinates(
  bbox: { x1: number; y1: number; x2: number; y2: number }, 
  displayWidth: number, 
  displayHeight: number
): {
  x: number;
  y: number;
  width: number;
  height: number;
  valid: boolean;
} {
  try {
    // Convert normalized coordinates (0-1) to display pixels
    const x = bbox.x1 * displayWidth;
    const y = bbox.y1 * displayHeight;
    const width = (bbox.x2 - bbox.x1) * displayWidth;
    const height = (bbox.y2 - bbox.y1) * displayHeight;
    
    // Check for valid dimensions
    const valid = width > 0 && height > 0 && 
                !isNaN(x) && !isNaN(y) && !isNaN(width) && !isNaN(height);
    
    return { x, y, width, height, valid };
  } catch (error) {
    console.error('Error converting coordinates:', error);
    return { x: 0, y: 0, width: 0, height: 0, valid: false };
  }
}
