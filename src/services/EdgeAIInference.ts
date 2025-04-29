import axios from 'axios';
import { toast } from 'sonner';

// Define the backend server URL
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export interface BackendDetection {
  label?: string;
  class?: string;
  confidence?: number;
  bbox?: number[]; // [x1, y1, x2, y2]
  x?: number;      // center x (normalized 0-1)
  y?: number;      // center y (normalized 0-1)
  width?: number;  // width (normalized 0-1)
  height?: number; // height (normalized 0-1)
}

export interface Detection {
  id: string;
  label: string;
  class: string;
  confidence: number;
  bbox?: number[]; // [x1, y1, x2, y2]
  x?: number;      // center x (normalized 0-1)
  y?: number;      // center y (normalized 0-1)
  width?: number;  // width (normalized 0-1)
  height?: number; // height (normalized 0-1)
}

export interface InferenceResponse {
  detections: BackendDetection[];
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

  connect(): Promise<boolean> {
    return new Promise((resolve, reject) => {
      if (this.isConnected && this.socket) {
        resolve(true);
        return;
      }

      try {
        this.socket = new WebSocket(this.url);

        this.socket.onopen = () => {
          console.log('WebSocket connection established');
          this.isConnected = true;
          this.reconnectAttempts = 0;
          this.pendingRequests = 0;
          resolve(true);
        };

        this.socket.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            
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
              console.log('WebSocket received message:', data);
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
          await this.connect();
        } catch (error) {
          this.pendingRequests = Math.max(0, this.pendingRequests - 1);
          reject(new Error('Failed to connect WebSocket'));
          return;
        }
      }
      
      if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
        this.pendingRequests = Math.max(0, this.pendingRequests - 1);
        reject(new Error('WebSocket is not open'));
        return;
      }

      try {
        // Register callback for this specific message
        const messageId = data.clientId || `msg-${Date.now()}`;
        
        // Set up a timeout to remove the callback if no response
        const timeout = setTimeout(() => {
          if (this.messageCallbacks.has(messageId)) {
            this.messageCallbacks.delete(messageId);
            this.pendingRequests = Math.max(0, this.pendingRequests - 1);
            reject(new Error('WebSocket response timeout'));
          }
        }, 10000); // 10 second timeout
        
        // Register the callback with timeout cleanup
        this.messageCallbacks.set(messageId, (response) => {
          clearTimeout(timeout);
          resolve(response);
        });
        
        // Send the message
        this.socket.send(JSON.stringify(data));
      } catch (error) {
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
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${wsProtocol}//${API_URL.replace(/^https?:\/\//, '')}/ws/inference`;
      this.webSocketManager = new WebSocketManager(wsUrl);
      
      // Try to establish connection proactively
      this.webSocketManager.connect().catch(error => {
        console.warn('WebSocket connection failed, will fall back to HTTP:', error);
        this.useWebSocket = false;
      });
    } else {
      this.useWebSocket = false;
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
            modelPath: request.modelPath,
            threshold: request.thresholdConfidence,
            imageData: request.imageData,
            quantized: request.quantized
          };
          
          // Send request via WebSocket
          const response = await this.webSocketManager.send(wsRequest);
          
          // Check if response has error
          if (response.error) {
            throw new Error(response.error);
          }
          
          return {
            detections: response.detections || [],
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
        
        // Make the API call
        const response = await axios.post(apiEndpoint, httpRequest, {
          headers: {
            'Content-Type': 'application/json'
          },
          timeout: 30000 // 30 second timeout for long inference operations
        });
        
        // Extract and return the response data
        return {
          detections: response.data.detections || [],
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
}

export default new EdgeAIInference();
