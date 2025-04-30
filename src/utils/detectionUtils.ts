
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
  // Initialize result with defaults first before any other operations
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
    if (typeof detection.x === 'number' && typeof detection.y === 'number' && 
        typeof detection.width === 'number' && typeof detection.height === 'number') {
      
      // Temporarily store values in local variables to avoid "Cannot access before initialization" errors
      const centerX = detection.x;
      const centerY = detection.y;
      const width = detection.width;
      const height = detection.height;
      
      // Only set properties after all calculations are done
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
        // Store in temporary variables first to avoid temporal dead zone issues
        const item0 = detection.bbox[0];
        const item1 = detection.bbox[1];
        const item2 = detection.bbox[2];
        const item3 = detection.bbox[3];
        
        // Verify all values are numbers
        if (typeof item0 === 'number' && typeof item1 === 'number' && 
            typeof item2 === 'number' && typeof item3 === 'number' &&
            !isNaN(item0) && !isNaN(item1) && !isNaN(item2) && !isNaN(item3)) {
          result.x1 = item0;
          result.y1 = item1;
          result.x2 = item2;
          result.y2 = item3;
          result.valid = true;
          return result;
        }
      }
      
      // Object format with {x1, y1, x2, y2}
      if (typeof detection.bbox === 'object' && detection.bbox !== null) {
        const bbox = detection.bbox;
        
        // Store in temporary variables first
        const x1 = bbox.x1;
        const y1 = bbox.y1;
        const x2 = bbox.x2;
        const y2 = bbox.y2;
        
        // Check each property individually
        if (typeof x1 === 'number' && typeof y1 === 'number' && 
            typeof x2 === 'number' && typeof y2 === 'number' &&
            !isNaN(x1) && !isNaN(y1) && !isNaN(x2) && !isNaN(y2)) {
          result.x1 = x1;
          result.y1 = y1;
          result.x2 = x2;
          result.y2 = y2;
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
    if (typeof bbox !== 'object' || bbox === null ||
        typeof bbox.x1 !== 'number' || typeof bbox.y1 !== 'number' ||
        typeof bbox.x2 !== 'number' || typeof bbox.y2 !== 'number' ||
        typeof displayWidth !== 'number' || typeof displayHeight !== 'number') {
      return result;
    }
    
    // Convert normalized coordinates (0-1) to display pixels
    result.x = bbox.x1 * displayWidth;
    result.y = bbox.y1 * displayHeight;
    result.width = (bbox.x2 - bbox.x1) * displayWidth;
    result.height = (bbox.y2 - bbox.y1) * displayHeight;
    
    // Check for valid dimensions
    result.valid = result.width > 0 && result.height > 0 && 
                  !isNaN(result.x) && !isNaN(result.y) && 
                  !isNaN(result.width) && !isNaN(result.height);
    
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
      if (typeof detection.x !== 'number' || typeof detection.y !== 'number' || 
          typeof detection.width !== 'number' || typeof detection.height !== 'number' ||
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
        // Check all values are valid numbers
        return detection.bbox.slice(0, 4).every(val => 
          typeof val === 'number' && !isNaN(val));
      }
      
      // Object format
      if (typeof detection.bbox === 'object' && detection.bbox !== null) {
        const bbox = detection.bbox;
        // Check all required properties exist and are numbers
        return ['x1', 'y1', 'x2', 'y2'].every(prop => {
          const value = (bbox as any)[prop];
          return typeof value === 'number' && !isNaN(value);
        });
      }
      
      return false;
    }
    
    return false;
  } catch (error) {
    console.error('Error validating detection:', error);
    return false;
  }
}
