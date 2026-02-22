import { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { Server as SocketIOServer } from 'socket.io';
import { inject } from '@ee/di';

import { CameraRouter } from './camera/camera.router';
import { StreamRouter } from './stream/stream.router';
import { DetectionRouter } from './detection/detection.router';
import { SnapshotRouter } from './snapshot/snapshot.router';
import { WebSocketService } from './websocket/websocket.service';
import { StreamService } from './stream/stream.service';
import { DetectionService } from './detection/detection.service';

// Import entities to register them
import './detection';

export async function Application(fastify: FastifyInstance) {
  // Initialize Socket.io on the underlying HTTP server
  const io = new SocketIOServer(fastify.server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
    path: '/ws',
  });

  io.on('connection', (socket) => {
    console.log(`🔌 Client connected: ${socket.id}`);
    socket.on('disconnect', () => {
      console.log(`🔌 Client disconnected: ${socket.id}`);
    });
  });

  // Initialize WebSocket service with the Socket.io instance
  const wsService = inject(WebSocketService);
  wsService.initialize(io);

  // Register API routes
  fastify
    .withTypeProvider<ZodTypeProvider>()
    .register(CameraRouter, { prefix: '/camera' });

  fastify
    .withTypeProvider<ZodTypeProvider>()
    .register(StreamRouter, { prefix: '/stream' });

  fastify
    .withTypeProvider<ZodTypeProvider>()
    .register(DetectionRouter, { prefix: '/detections' });

  fastify
    .withTypeProvider<ZodTypeProvider>()
    .register(SnapshotRouter, { prefix: '/snapshots' });

  // Start the stream and detection pipeline after server is ready
  fastify.addHook('onReady', async () => {
    const streamService = inject(StreamService);
    const detectionService = inject(DetectionService);

    try {
      await streamService.start();
      console.log('📹 Stream service started');
    } catch (err) {
      console.error('❌ Failed to start stream service:', err);
    }

    try {
      await detectionService.start();
      console.log('🧠 Detection service started');
    } catch (err) {
      console.error('❌ Failed to start detection service:', err);
    }
  });

  // Graceful shutdown
  fastify.addHook('onClose', async () => {
    const streamService = inject(StreamService);
    const detectionService = inject(DetectionService);

    detectionService.stop();
    streamService.stop();
    io.close();
    console.log('🛑 Camera services stopped');
  });
}
