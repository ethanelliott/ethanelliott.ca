import { FastifyInstance } from 'fastify';
import { inject } from '@ee/di';
import { AranetService, HistoryQuery } from './aranet.service';
import { DeviceService } from './device.service';
import { MeasurementType } from './measurement-types';

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

  /** GET /aranet/devices/:id/readings?limit=.. — simple latest-N readings. */
  fastify.get('/devices/:id/readings', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!(await deviceService.getById(id))) {
      return reply.status(404).send({ error: 'Device not found' });
    }
    const limit = Number((req.query as { limit?: string }).limit) || 200;
    return aranetService.getReadings(id, limit);
  });

  /**
   * GET /aranet/devices/:id/history?before=<ISO>&hours=24&limit=..
   * Paged full readings, newest first; each page is a time window (default
   * 1 day). Follow `nextBefore` in the response to page to older data.
   */
  fastify.get('/devices/:id/history', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!(await deviceService.getById(id))) {
      return reply.status(404).send({ error: 'Device not found' });
    }
    const parsed = parseHistoryQuery(req.query);
    if ('error' in parsed) return reply.status(400).send(parsed);
    return aranetService.getHistory(id, parsed);
  });

  /**
   * GET /aranet/devices/:id/series?type=co2&before=<ISO>&hours=24&limit=..
   * Paged flat {t, v} points for a single measurement type — for charting.
   */
  fastify.get('/devices/:id/series', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!(await deviceService.getById(id))) {
      return reply.status(404).send({ error: 'Device not found' });
    }
    const type = (req.query as { type?: string }).type;
    if (!type || !(MEASUREMENT_TYPES as readonly string[]).includes(type)) {
      return reply
        .status(400)
        .send({ error: `type must be one of: ${MEASUREMENT_TYPES.join(', ')}` });
    }
    const parsed = parseHistoryQuery(req.query);
    if ('error' in parsed) return reply.status(400).send(parsed);
    return aranetService.getSeries(id, type as MeasurementType, parsed);
  });
}

const MEASUREMENT_TYPES = [
  'co2',
  'radon',
  'temperature',
  'humidity',
  'pressure',
  'battery',
  'status',
] as const;

/** Parse common history paging params, or return an `{ error }`. */
function parseHistoryQuery(
  query: unknown
): HistoryQuery | { error: string } {
  const q = (query ?? {}) as {
    before?: string;
    hours?: string;
    limit?: string;
  };

  let before: Date | undefined;
  if (q.before !== undefined) {
    before = new Date(q.before);
    if (Number.isNaN(before.getTime())) {
      return { error: 'before must be a valid ISO timestamp' };
    }
  }

  const hours = q.hours !== undefined ? Number(q.hours) : undefined;
  if (hours !== undefined && (!Number.isFinite(hours) || hours <= 0)) {
    return { error: 'hours must be a positive number' };
  }

  const limit = q.limit !== undefined ? Number(q.limit) : undefined;
  if (limit !== undefined && (!Number.isFinite(limit) || limit <= 0)) {
    return { error: 'limit must be a positive number' };
  }

  return { before, hours, limit };
}
