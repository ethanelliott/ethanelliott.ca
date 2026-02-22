import { Server as SocketIOServer } from 'socket.io';
import {
  DetectionEventOut,
  FrameDetection,
} from '../detection/detection.entity';

/**
 * WebSocketService manages the Socket.io instance and provides
 * methods for emitting real-time detection events to connected clients.
 */
export class WebSocketService {
  private _io: SocketIOServer | null = null;
  private _connectedClients = 0;

  /**
   * Initialize with a Socket.io server instance.
   * Called from app.ts after the Fastify server is created.
   */
  initialize(io: SocketIOServer): void {
    this._io = io;

    io.on('connection', (socket) => {
      this._connectedClients++;
      console.log(
        `🔌 WebSocket client connected (${this._connectedClients} total)`
      );

      socket.on('disconnect', () => {
        this._connectedClients--;
        console.log(
          `🔌 WebSocket client disconnected (${this._connectedClients} total)`
        );
      });
    });
  }

  /**
   * Emit a detection event to all connected clients (new objects only, for event feed)
   */
  emitDetection(event: DetectionEventOut): void {
    if (this._io) {
      this._io.emit('detection', event);
    }
  }

  /**
   * Emit all detections from the current frame (for live overlay)
   */
  emitFrameDetections(detections: FrameDetection[]): void {
    if (this._io) {
      this._io.emit('frame-detections', detections);
    }
  }

  /**
   * Emit a stream status change
   */
  emitStreamStatus(status: { running: boolean }): void {
    if (this._io) {
      this._io.emit('stream:status', status);
    }
  }

  /**
   * Get the number of connected clients
   */
  getConnectedClients(): number {
    return this._connectedClients;
  }

  /**
   * Check if the Socket.io server is initialized
   */
  isInitialized(): boolean {
    return this._io !== null;
  }
}
