
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
  if (!modelName || typeof modelName !== 'string') return '#FF0000'; // Red
  
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
  
  // Check for exact match first
  for (const key in colorMap) {
    if (normalizedName === key) {
      return colorMap[key];
    }
  }
  
  // Check for partial match
  for (const key in colorMap) {
    if (normalizedName.includes(key)) {
      return colorMap[key];
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
  // Initialize result with defaults
  const result = {
    x1: 0,
    y1: 0,
    x2: 0,
    y2: 0,
    valid: false
  };
  
  // Safety check for null/undefined detection
  if (!detection) return result;
  
  try {
    // Handle YOLO-style center+dimensions format
    if (typeof detection.x === 'number' && 
        typeof detection.y === 'number' && 
        typeof detection.width === 'number' && 
        typeof detection.height === 'number') {
      
      // Store in local variables first
      const x = detection.x;
      const y = detection.y;
      const width = detection.width;
      const height = detection.height;
      
      // Set properties after calculations
      result.x1 = x - (width / 2);
      result.y1 = y - (height / 2);
      result.x2 = x + (width / 2);
      result.y2 = y + (height / 2);
      result.valid = true;
      return result;
    }
    
    // Handle bbox formats
    if (detection.bbox) {
      // Array format [x1, y1, x2, y2]
      if (Array.isArray(detection.bbox) && detection.bbox.length >= 4) {
        const bboxArray = detection.bbox;
        
        // Check all values are valid numbers
        if (typeof bboxArray[0] === 'number' && 
            typeof bboxArray[1] === 'number' && 
            typeof bboxArray[2] === 'number' && 
            typeof bboxArray[3] === 'number' &&
            !isNaN(bboxArray[0]) && 
            !isNaN(bboxArray[1]) && 
            !isNaN(bboxArray[2]) && 
            !isNaN(bboxArray[3])) {
          
          result.x1 = bboxArray[0];
          result.y1 = bboxArray[1];
          result.x2 = bboxArray[2];
          result.y2 = bboxArray[3];
          result.valid = true;
          return result;
        }
      }
      
      // Object format with {x1, y1, x2, y2}
      if (typeof detection.bbox === 'object' && detection.bbox !== null) {
        const bbox = detection.bbox;
        
        // Check each property individually without destructuring
        if (typeof bbox.x1 === 'number' && 
            typeof bbox.y1 === 'number' && 
            typeof bbox.x2 === 'number' && 
            typeof bbox.y2 === 'number' &&
            !isNaN(bbox.x1) && 
            !isNaN(bbox.y1) && 
            !isNaN(bbox.x2) && 
            !isNaN(bbox.y2)) {
          
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
    return result; // Returns with valid=false in case of error
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
  // Initialize result before any calculations
  const result = {
    x: 0, 
    y: 0, 
    width: 0, 
    height: 0, 
    valid: false
  };
  
  try {
    // Check inputs before calculations
    if (typeof bbox !== 'object' || 
        bbox === null ||
        typeof bbox.x1 !== 'number' || 
        typeof bbox.y1 !== 'number' ||
        typeof bbox.x2 !== 'number' || 
        typeof bbox.y2 !== 'number' ||
        typeof displayWidth !== 'number' || 
        typeof displayHeight !== 'number') {
      return result;
    }
    
    // Convert normalized coordinates to display pixels
    const x = bbox.x1 * displayWidth;
    const y = bbox.y1 * displayHeight;
    const width = (bbox.x2 - bbox.x1) * displayWidth;
    const height = (bbox.y2 - bbox.y1) * displayHeight;
    
    // Assign calculated values
    result.x = x;
    result.y = y;
    result.width = width;
    result.height = height;
    
    // Check for valid dimensions
    result.valid = width > 0 && height > 0 && 
                  !isNaN(x) && !isNaN(y) && 
                  !isNaN(width) && !isNaN(height);
    
    return result;
  } catch (error) {
    console.error('Error converting coordinates:', error);
    return result;
  }
}

// Safe rendering check - validates if a detection can be safely rendered
export function canSafelyRenderDetection(detection: any): boolean {
  if (!detection) return false;
  
  try {
    // Check for required properties
    if (typeof detection.label !== 'string' && typeof detection.class !== 'string') {
      return false;
    }
    
    // Validate center+dimensions format
    if (detection.x !== undefined && detection.y !== undefined && 
        detection.width !== undefined && detection.height !== undefined) {
      // Check for valid numeric values
      if (typeof detection.x !== 'number' || 
          typeof detection.y !== 'number' || 
          typeof detection.width !== 'number' || 
          typeof detection.height !== 'number' ||
          isNaN(detection.x) || isNaN(detection.y) || 
          isNaN(detection.width) || isNaN(detection.height)) {
        return false;
      }
      return true;
    }
    
    // Validate bbox format
    if (detection.bbox) {
      // Array format
      if (Array.isArray(detection.bbox)) {
        if (detection.bbox.length < 4) return false;
        
        // Check all values are valid numbers - without destructuring
        for (let i = 0; i < 4; i++) {
          if (typeof detection.bbox[i] !== 'number' || isNaN(detection.bbox[i])) {
            return false;
          }
        }
        return true;
      }
      
      // Object format
      if (typeof detection.bbox === 'object' && detection.bbox !== null) {
        const bbox = detection.bbox;
        
        // Check all required properties exist and are numbers
        const props = ['x1', 'y1', 'x2', 'y2'];
        for (let i = 0; i < props.length; i++) {
          const prop = props[i];
          const value = (bbox as any)[prop];
          if (typeof value !== 'number' || isNaN(value)) {
            return false;
          }
        }
        return true;
      }
      
      return false;
    }
    
    return false;
  } catch (error) {
    console.error('Error validating detection:', error);
    return false;
  }
}
