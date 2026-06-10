import { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { Server as SocketIOServer } from 'socket.io';
import { inject } from '@ee/di';

import { CameraRouter } from './camera/camera.router';
import { StreamRouter } from './stream/stream.router';
import { DetectionRouter } from './detection/detection.router';
import { SnapshotRouter } from './snapshot/snapshot.router';
import { NotificationRouter } from './notification/notification.router';
import { AnalysisRouter } from './analysis/analysis.router';
import { CleanupRouter } from './cleanup/cleanup.router';
import { RecordingRouter } from './recording/recording.router';
import { WebSocketService } from './websocket/websocket.service';
import { StreamService } from './stream/stream.service';
import { DetectionService } from './detection/detection.service';
import { RecordingService } from './recording/recording.service';
import { NotificationService } from './notification/notification.service';
import { AnalysisService } from './analysis/analysis.service';
import { CleanupService } from './cleanup/cleanup.service';

// Import entities to register them
import './detection';
import './notification';
import './analysis';
import './recording';

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

  fastify
    .withTypeProvider<ZodTypeProvider>()
    .register(NotificationRouter, { prefix: '/notifications' });

  fastify
    .withTypeProvider<ZodTypeProvider>()
    .register(AnalysisRouter, { prefix: '/analysis' });

  fastify
    .withTypeProvider<ZodTypeProvider>()
    .register(CleanupRouter, { prefix: '/cleanup' });

  fastify
    .withTypeProvider<ZodTypeProvider>()
    .register(RecordingRouter, { prefix: '/recordings' });

  // Start the stream and detection pipeline after server is ready
  fastify.addHook('onReady', async () => {
    const streamService = inject(StreamService);
    const detectionService = inject(DetectionService);

    // Recording settings must be loaded before the stream starts so the
    // FFmpeg recording output reflects the persisted configuration.
    const recordingService = inject(RecordingService);
    try {
      await recordingService.initialize();
      console.log('🎞️ Recording service initialized');
    } catch (err) {
      console.error('❌ Failed to initialize recording service:', err);
    }

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

    const notificationService = inject(NotificationService);
    try {
      await notificationService.initialize();
      console.log('🔔 Notification service initialized');
    } catch (err) {
      console.error('❌ Failed to initialize notification service:', err);
    }

    const analysisService = inject(AnalysisService);
    try {
      await analysisService.initialize();
      console.log('🔬 Analysis service initialized');
    } catch (err) {
      console.error('❌ Failed to initialize analysis service:', err);
    }

    const cleanupService = inject(CleanupService);
    cleanupService.start();
  });

  // Graceful shutdown
  fastify.addHook('onClose', async () => {
    const streamService = inject(StreamService);
    const detectionService = inject(DetectionService);

    const cleanupService = inject(CleanupService);
    cleanupService.stop();
    detectionService.stop();
    streamService.stop();
    io.close();
    console.log('🛑 Camera services stopped');
  });
}
