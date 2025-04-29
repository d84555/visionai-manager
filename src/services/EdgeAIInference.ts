
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

interface InferenceResponse {
  detections: BackendDetection[];
  inferenceTime: number;
  processedAt: 'edge' | 'server';
  timestamp: string;
}

interface InferenceRequest {
  imageData: string;
  cameraId: string;
  modelName: string;
  modelPath: string;
  thresholdConfidence: number;
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
          resolve(true);
        };

        this.socket.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            
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

  async send(data: any): Promise<any> {
    // Ensure clientId is included in the message
    if (this.clientId) {
      data.clientId = this.clientId;
    }
    
    return new Promise(async (resolve, reject) => {
      if (!this.isConnected) {
        try {
          await this.connect();
        } catch (error) {
          reject(new Error('Failed to connect WebSocket'));
          return;
        }
      }
      
      if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
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
        reject(error);
      }
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
      this.isConnected = false;
      
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
  }

  async performInference(request: InferenceRequest): Promise<InferenceResponse> {
    try {
      // Try WebSocket first if enabled and available
      if (this.useWebSocket && this.webSocketManager?.isWebSocketAvailable()) {
        try {
          const wsRequest = {
            modelPath: request.modelPath,
            threshold: request.thresholdConfidence,
            imageData: request.imageData
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
          console.warn('WebSocket inference failed, falling back to HTTP API:', wsError);
          // Fall back to HTTP API
          this.useWebSocket = false;
        }
      }
      
      // HTTP API fallback
      const apiEndpoint = `${API_URL}/inference/detect`;
      
      // Prepare the HTTP request
      const httpRequest = {
        modelPath: request.modelPath,
        threshold: request.thresholdConfidence,
        imageData: request.imageData
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
      
    } catch (error) {
      console.error('Inference API error:', error);
      
      // Show toast only for persistent errors
      if (axios.isAxiosError(error) && error.code !== 'ECONNABORTED') {
        toast.error('Edge AI inference failed', {
          description: 'Check if the Edge AI server is running'
        });
      }
      
      // Return empty result
      return {
        detections: [],
        inferenceTime: 0,
        processedAt: 'server',
        timestamp: new Date().toISOString()
      };
    }
  }
}

export default new EdgeAIInference();
