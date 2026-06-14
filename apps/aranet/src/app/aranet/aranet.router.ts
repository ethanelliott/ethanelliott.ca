import { FastifyInstance } from 'fastify';
import { inject } from '@ee/di';
import { AranetService } from './aranet.service';
import { DeviceService } from './device.service';

export async function AranetRouter(fastify: FastifyInstance) {
  const aranetService = inject(AranetService);
  const deviceService = inject(DeviceService);

  // ── readings ─────────────────────────────────────────────────────

  /** GET /aranet — latest reading (with measurements) per device. */
  fastify.get('/', async () => {
    return aranetService.getLatest();
  });

  /** GET /aranet/scan — Aranet devices currently visible over BLE. */
  fastify.get('/scan', async () => {
    return aranetService.scan();
  });

  // ── devices ──────────────────────────────────────────────────────

  /** GET /aranet/devices — list managed devices. */
  fastify.get('/devices', async () => {
    return deviceService.list();
  });

  /** POST /aranet/devices — add a device. Body: { macAddress, name?, type }. */
  fastify.post('/devices', async (req, reply) => {
    const body = (req.body ?? {}) as {
      macAddress?: string;
      name?: string;
      type?: string;
    };
    if (!body.macAddress) {
      return reply.status(400).send({ error: 'macAddress is required' });
    }
    if (body.type !== 'co2' && body.type !== 'radon') {
      return reply.status(400).send({ error: "type must be 'co2' or 'radon'" });
    }
    try {
      const device = await deviceService.add({
        macAddress: body.macAddress,
        name: body.name,
        type: body.type,
      });
      return reply.status(201).send(device);
    } catch (err) {
      return reply.status(409).send({ error: (err as Error).message });
    }
  });

  /** PATCH /aranet/devices/:id — update name/enabled. */
  fastify.patch('/devices/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as { name?: string; enabled?: boolean };
    const device = await deviceService.update(id, body);
    if (!device) return reply.status(404).send({ error: 'Device not found' });
    return device;
  });

  /** DELETE /aranet/devices/:id — remove a device and its readings. */
  fastify.delete('/devices/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const removed = await deviceService.remove(id);
    if (!removed) return reply.status(404).send({ error: 'Device not found' });
    return reply.status(204).send();
  });

  /** GET /aranet/devices/:id/readings?limit=.. — history for one device. */
  fastify.get('/devices/:id/readings', async (req) => {
    const { id } = req.params as { id: string };
    const limit = Number((req.query as { limit?: string }).limit) || 200;
    return aranetService.getReadings(id, limit);
  });
}
