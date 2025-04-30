
import axios from 'axios';
import { toast } from 'sonner';

// Define the backend server URL with fallback to window.location based URL
const API_URL = (() => {
  // First try environment variable
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  
  // Fall back to current origin with port 8000
  try {
    const { protocol, hostname } = window.location;
    return `${protocol}//${hostname}:8000`;
  } catch (e) {
    // Final fallback
    return 'http://localhost:8000';
  }
})();

console.log(`Using API URL: ${API_URL}`);

export interface BackendDetection {
  label?: string;
  class?: string;
  class_name?: string;
  confidence?: number;
  bbox?: number[] | { x1: number; y1: number; x2: number; y2: number; width: number; height: number; }; 
  x?: number;      // center x (normalized 0-1)
  y?: number;      // center y (normalized 0-1)
  width?: number;  // width (normalized 0-1)
  height?: number; // height (normalized 0-1)
  model?: string;  // The model that produced this detection
}

export interface Detection {
  id: string;
  label: string;
  class: string;
  confidence: number;
  bbox?: number[] | { x1: number; y1: number; x2: number; y2: number; width: number; height: number; }; 
  x?: number;      // center x (normalized 0-1)
  y?: number;      // center y (normalized 0-1)
  width?: number;  // width (normalized 0-1)
  height?: number; // height (normalized 0-1)
  model?: string;  // The model that produced this detection
}

export interface InferenceResponse {
  detections: BackendDetection[];
  modelResults?: Record<string, BackendDetection[]>;
  inferenceTime: number;
  processedAt: 'edge' | 'server';
  timestamp: string;
}

export interface InferenceRequest {
  imageData: string;
  cameraId: string;
  modelName: string;
  modelPath: string;
  thresholdConfidence: number;
  quantized?: boolean; // Flag to use quantized model
}

// WebSocket connection management
class WebSocketManager {
  private socket: WebSocket | null = null;
  private isConnected = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private messageCallbacks: Map<string, (data: any) => void> = new Map();
  private clientId: string | null = null;
  private pendingRequests = 0;
  public maxPendingRequests = 3; // Maximum number of in-flight requests

  constructor(private url: string) {}

  // Add public getter methods for private properties
  public getConnectionStatus(): boolean {
    return this.isConnected;
  }

  public getPendingRequestsCount(): number {
    return this.pendingRequests;
  }

  connect(): Promise<boolean> {
    return new Promise((resolve, reject) => {
      if (this.isConnected && this.socket) {
        resolve(true);
        return;
      }

      try {
        console.log(`Attempting WebSocket connection to ${this.url}`);
        this.socket = new WebSocket(this.url);

        // Add connection timeout
        const connectionTimeout = setTimeout(() => {
          if (this.socket && this.socket.readyState !== WebSocket.OPEN) {
            console.error('WebSocket connection timeout');
            this.socket.close();
            reject(new Error('WebSocket connection timeout'));
          }
        }, 5000);

        this.socket.onopen = () => {
          clearTimeout(connectionTimeout);
          console.log('WebSocket connection established');
          this.isConnected = true;
          this.reconnectAttempts = 0;
          this.pendingRequests = 0;
          resolve(true);
        };

        this.socket.onmessage = (event) => {
          try {
            // Log raw message first for debugging
            console.log('Raw WebSocket message received:', event.data);
            
            // Then parse
            const data = JSON.parse(event.data);
            console.log('WebSocket received message:', data);
            
            // Decrement pending requests counter
            this.pendingRequests = Math.max(0, this.pendingRequests - 1);
            
            // Store client ID if received from server
            if (data.clientId && !this.clientId) {
              this.clientId = data.clientId;
              console.log(`WebSocket client ID: ${this.clientId}`);
            }
            
            // Handle response by clientId or as general message
            if (data.clientId && this.messageCallbacks.has(data.clientId)) {
              this.messageCallbacks.get(data.clientId)?.(data);
              this.messageCallbacks.delete(data.clientId);
            } else {
              // Handle general messages
              console.log('WebSocket received message without callback:', data);
            }
            
            // Log detection info for debugging
            if (data.detections && data.detections.length > 0) {
              console.log(`Received ${data.detections.length} detections`);
              console.log('Sample detection:', data.detections[0]);
            } else {
              console.log('No detections received in response');
            }
            
            // Log model-specific results if available
            if (data.modelResults) {
              console.log('Model results:', Object.keys(data.modelResults));
              for (const [modelName, detections] of Object.entries(data.modelResults)) {
                console.log(`Model ${modelName} has ${(detections as any[]).length} detections`);
              }
            }
          } catch (error) {
            console.error('Error parsing WebSocket message:', error);
          }
        };

        this.socket.onclose = () => {
          this.isConnected = false;
          console.log('WebSocket connection closed');
          
          if (this.reconnectAttempts < this.maxReconnectAttempts) {
            const delay = Math.min(1000 * (this.reconnectAttempts + 1), 5000);
            console.log(`Attempting to reconnect in ${delay}ms...`);
            
            this.reconnectTimeout = setTimeout(() => {
              this.reconnectAttempts++;
              this.connect().catch(console.error);
            }, delay);
          } else {
            console.error('Maximum WebSocket reconnection attempts reached');
            reject(new Error('Maximum WebSocket reconnection attempts reached'));
          }
        };

        this.socket.onerror = (error) => {
          console.error('WebSocket error:', error);
          reject(error);
        };
      } catch (error) {
        console.error('Error creating WebSocket:', error);
        reject(error);
      }
    });
  }

  // Check if there are too many pending requests
  hasTooManyPendingRequests(): boolean {
    return this.pendingRequests >= this.maxPendingRequests;
  }

  async send(data: any): Promise<any> {
    console.log('[WebSocket] Sending request:', data);
    
    // Check if we're already at max pending requests
    if (this.hasTooManyPendingRequests()) {
      console.log(`Dropping frame - too many pending requests (${this.pendingRequests}/${this.maxPendingRequests})`);
      return Promise.reject(new Error('Too many pending requests'));
    }
    
    // Increment pending requests counter
    this.pendingRequests++;
    
    // Ensure clientId is included in the message
    if (this.clientId) {
      data.clientId = this.clientId;
    }
    
    return new Promise(async (resolve, reject) => {
      if (!this.isConnected) {
        try {
          console.log('WebSocket not connected, trying to connect...');
          await this.connect();
        } catch (error) {
          this.pendingRequests = Math.max(0, this.pendingRequests - 1);
          console.error('Failed to connect WebSocket:', error);
          reject(new Error('Failed to connect WebSocket'));
          return;
        }
      }
      
      if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
        this.pendingRequests = Math.max(0, this.pendingRequests - 1);
        console.error('WebSocket is not open');
        reject(new Error('WebSocket is not open'));
        return;
      }

      try {
        // Register callback for this specific message
        const messageId = data.clientId || `msg-${Date.now()}`;
        console.log(`Registering callback for message ${messageId}`);
        
        // Set up a timeout to remove the callback if no response
        const timeout = setTimeout(() => {
          if (this.messageCallbacks.has(messageId)) {
            console.error(`WebSocket response timeout for message ${messageId}`);
            this.messageCallbacks.delete(messageId);
            this.pendingRequests = Math.max(0, this.pendingRequests - 1);
            reject(new Error('WebSocket response timeout'));
          }
        }, 10000); // 10 second timeout
        
        // Register the callback with timeout cleanup
        this.messageCallbacks.set(messageId, (response) => {
          console.log(`Received response for message ${messageId}`);
          clearTimeout(timeout);
          resolve(response);
        });
        
        // Ensure proper serialization and safe debug logging of message
        let messageToSend;
        try {
          // Prepare message with proper serialization
          messageToSend = JSON.stringify(data);
          
          // Log message size for debugging
          console.log(`Sending WebSocket message (size: ${messageToSend.length}) for ${messageId}`);
          
          // For large messages, don't log the full content
          if (messageToSend.length > 1000) {
            console.log('Message too large to log fully, logging metadata:', {
              messageId,
              modelPaths: data.modelPaths,
              hasImageData: !!data.imageData,
              imageDataLength: data.imageData?.length || 0,
              threshold: data.threshold
            });
          } else {
            console.log(`Full message for ${messageId}:`, data);
          }
          
          this.socket.send(messageToSend);
        } catch (sendError) {
          console.error('Error serializing or sending WebSocket message:', sendError);
          this.pendingRequests = Math.max(0, this.pendingRequests - 1);
          clearTimeout(timeout);
          this.messageCallbacks.delete(messageId);
          reject(sendError);
        }
      } catch (error) {
        console.error('Error sending WebSocket message:', error);
        this.pendingRequests = Math.max(0, this.pendingRequests - 1);
        reject(error);
      }
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
      this.isConnected = false;
      this.pendingRequests = 0;
      
      if (this.reconnectTimeout) {
        clearTimeout(this.reconnectTimeout);
        this.reconnectTimeout = null;
      }
    }
  }

  isWebSocketAvailable(): boolean {
    return typeof WebSocket !== 'undefined';
  }
}

class EdgeAIInference {
  private webSocketManager: WebSocketManager | null = null;
  private useWebSocket = true; // Default to using WebSockets when available
  private pendingHttpRequests = 0;
  private maxPendingHttpRequests = 2; // Maximum concurrent HTTP requests
  private lastRequestTimestamp = 0;
  private minRequestInterval = 50; // Minimum 50ms between requests (20 FPS max)
  private useQuantizedModels = false; // Flag to use quantized models when available
  
  constructor() {
    // Initialize WebSocket if available
    if (typeof WebSocket !== 'undefined') {
      // Use API_URL but replace http/https with ws/wss
      const wsUrl = API_URL.replace(/^http/, 'ws') + '/ws/inference';
      console.log(`Initializing WebSocket with URL: ${wsUrl}`);
      
      this.webSocketManager = new WebSocketManager(wsUrl);
      
      // Try to establish connection proactively
      this.webSocketManager.connect().catch(error => {
        console.warn('WebSocket connection failed, will fall back to HTTP:', error);
        this.useWebSocket = false;
      });
    } else {
      this.useWebSocket = false;
      console.warn('WebSocket not available in this environment');
    }

    // Check for hardware capabilities
    this.detectHardwareCapabilities();
  }

  // Check if the device supports advanced features like quantization
  private async detectHardwareCapabilities(): Promise<void> {
    try {
      const response = await axios.get(`${API_URL}/system/info`);
      
      if (response.data?.gpu_info?.fp16_supported) {
        console.log('FP16 acceleration supported');
      }
      
      // Enable quantization if available
      if (response.data?.gpu_info?.quantization_available) {
        console.log('INT8 quantization supported, enabling optimized models');
        this.useQuantizedModels = true;
      }
    } catch (error) {
      console.warn('Failed to detect hardware capabilities:', error);
    }
  }

  // Check if we should drop this frame based on timing and pending requests
  private shouldDropFrame(): boolean {
    const now = Date.now();
    
    // Rate limiting based on minimum interval
    if (now - this.lastRequestTimestamp < this.minRequestInterval) {
      return true;
    }
    
    // Too many HTTP requests already in flight
    if (this.pendingHttpRequests >= this.maxPendingHttpRequests) {
      return true;
    }
    
    // WebSocket has too many pending requests
    if (this.useWebSocket && 
        this.webSocketManager?.isWebSocketAvailable() && 
        this.webSocketManager?.hasTooManyPendingRequests()) {
      return true;
    }
    
    return false;
  }

  async performInference(request: InferenceRequest): Promise<InferenceResponse> {
    // Check if we should drop this frame
    if (this.shouldDropFrame()) {
      throw new Error('Frame dropped - too many requests in flight or rate limited');
    }
    
    // Update last request timestamp
    this.lastRequestTimestamp = Date.now();
    
    try {
      // Add quantization flag if supported
      if (this.useQuantizedModels) {
        request.quantized = true;
      }
      
      // Try WebSocket first if enabled and available
      if (this.useWebSocket && this.webSocketManager?.isWebSocketAvailable()) {
        try {
          const wsRequest = {
            modelPaths: Array.isArray(request.modelPath) ? request.modelPath : [request.modelPath],
            threshold: request.thresholdConfidence,
            imageData: request.imageData,
            quantized: request.quantized
          };
          
          console.log('Sending WebSocket inference request:', {
            modelPaths: wsRequest.modelPaths,
            threshold: wsRequest.threshold,
            imageSize: wsRequest.imageData.length,
            quantized: wsRequest.quantized
          });
          
          // Send request via WebSocket
          const response = await this.webSocketManager.send(wsRequest);
          
          // Check if response has error
          if (response.error) {
            throw new Error(response.error);
          }
          
          console.log('WebSocket inference response:', {
            detectionCount: response.detections?.length || 0,
            processedAt: response.processedAt,
            inferenceTime: response.inferenceTime,
            modelResults: response.modelResults ? Object.keys(response.modelResults) : 'none'
          });
          
          // If we have model results, log them
          if (response.modelResults) {
            for (const [model, detections] of Object.entries(response.modelResults)) {
              console.log(`Model ${model} returned ${(detections as any[]).length} detections`);
              if ((detections as any[]).length > 0) {
                console.log('Sample detection:', (detections as any[])[0]);
              }
            }
          }
          
          return {
            detections: response.detections || [],
            modelResults: response.modelResults,
            inferenceTime: response.inferenceTime || 0,
            processedAt: response.processedAt || 'server',
            timestamp: response.timestamp || new Date().toISOString()
          };
        } catch (wsError) {
          if (wsError.message === 'Too many pending requests' || 
              wsError.message === 'Frame dropped - too many requests in flight or rate limited') {
            // This is an expected error for frame dropping
            console.debug('WebSocket frame dropped due to rate limiting');
            throw wsError;
          }
          
          console.warn('WebSocket inference failed, falling back to HTTP API:', wsError);
          // Fall back to HTTP API
          this.useWebSocket = false;
        }
      }
      
      // HTTP API fallback
      const apiEndpoint = `${API_URL}/inference/detect`;
      
      // Increment pending HTTP requests
      this.pendingHttpRequests++;
      
      try {
        // Prepare the HTTP request
        const httpRequest = {
          modelPath: request.modelPath,
          threshold: request.thresholdConfidence,
          imageData: request.imageData,
          quantized: request.quantized
        };
        
        console.log('Falling back to HTTP API for inference');
        
        // Make the API call
        const response = await axios.post(apiEndpoint, httpRequest, {
          headers: {
            'Content-Type': 'application/json'
          },
          timeout: 30000 // 30 second timeout for long inference operations
        });
        
        console.log('HTTP inference response:', {
          detectionCount: response.data.detections?.length || 0,
          processedAt: response.data.processedAt,
          inferenceTime: response.data.inferenceTime
        });
        
        // Extract and return the response data
        return {
          detections: response.data.detections || [],
          modelResults: response.data.modelResults,
          inferenceTime: response.data.inferenceTime || 0,
          processedAt: response.data.processedAt || 'server',
          timestamp: response.data.timestamp || new Date().toISOString()
        };
      } finally {
        // Decrement pending HTTP requests
        this.pendingHttpRequests = Math.max(0, this.pendingHttpRequests - 1);
      }
      
    } catch (error) {
      console.error('Inference API error:', error);
      
      // Only show toast for persistent errors, not for frame dropping
      if (axios.isAxiosError(error) && error.code !== 'ECONNABORTED' && 
          !error.message.includes('Frame dropped') && 
          !error.message.includes('Too many pending requests')) {
        toast.error('Edge AI inference failed', {
          description: 'Check if the Edge AI server is running'
        });
      }
      
      // Re-throw specific errors
      if (error.message.includes('Frame dropped') || 
          error.message.includes('Too many pending requests')) {
        throw error;
      }
      
      // Return empty result for other errors
      return {
        detections: [],
        inferenceTime: 0,
        processedAt: 'server',
        timestamp: new Date().toISOString()
      };
    }
  }

  // Configure performance settings
  setPerformanceSettings(settings: {
    maxPendingRequests?: number,
    minRequestInterval?: number,
    useQuantized?: boolean
  }) {
    if (settings.maxPendingRequests !== undefined) {
      this.maxPendingHttpRequests = settings.maxPendingRequests;
      
      if (this.webSocketManager) {
        this.webSocketManager.maxPendingRequests = settings.maxPendingRequests;
      }
    }
    
    if (settings.minRequestInterval !== undefined) {
      this.minRequestInterval = settings.minRequestInterval;
    }
    
    if (settings.useQuantized !== undefined) {
      this.useQuantizedModels = settings.useQuantized;
    }
    
    console.log('Performance settings updated:', {
      maxPendingRequests: this.maxPendingHttpRequests,
      minRequestInterval: this.minRequestInterval,
      useQuantizedModels: this.useQuantizedModels
    });
  }

  // New method to check WebSocket connection health
  checkConnectionHealth(): { 
    websocketAvailable: boolean; 
    websocketConnected: boolean; 
    pendingRequests: number; 
  } {
    return {
      websocketAvailable: this.webSocketManager?.isWebSocketAvailable() || false,
      // Use the getter methods instead of directly accessing private properties
      websocketConnected: this.useWebSocket && !!this.webSocketManager && 
                          this.webSocketManager.getConnectionStatus() || false,
      pendingRequests: this.webSocketManager?.getPendingRequestsCount() || this.pendingHttpRequests
    };
  }
}

export default new EdgeAIInference();
