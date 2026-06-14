import { inject } from '@ee/di';
import { Database } from '../data-source';
import { DeviceEntity } from './device.entity';
import { AranetDeviceType } from './aranet.parser';

export interface AddDeviceInput {
  macAddress: string;
  name?: string;
  type: AranetDeviceType;
}

export class DeviceService {
  private readonly _db = inject(Database);
  private readonly _repo = this._db.repositoryFor(DeviceEntity);

  list(): Promise<DeviceEntity[]> {
    return this._repo.find({ order: { createdAt: 'ASC' } });
  }

  listEnabled(): Promise<DeviceEntity[]> {
    return this._repo.find({ where: { enabled: true } });
  }

  getById(id: string): Promise<DeviceEntity | null> {
    return this._repo.findOne({ where: { id } });
  }

  async add(input: AddDeviceInput): Promise<DeviceEntity> {
    const macAddress = input.macAddress.toUpperCase();
    const existing = await this._repo.findOne({ where: { macAddress } });
    if (existing) {
      throw new Error(`Device ${macAddress} already exists`);
    }
    const device = this._repo.create({
      macAddress,
      name: input.name?.trim() || macAddress,
      type: input.type,
      enabled: true,
    });
    return this._repo.save(device);
  }

  async update(
    id: string,
    patch: { name?: string; enabled?: boolean }
  ): Promise<DeviceEntity | null> {
    const device = await this.getById(id);
    if (!device) return null;
    if (patch.name !== undefined) device.name = patch.name;
    if (patch.enabled !== undefined) device.enabled = patch.enabled;
    return this._repo.save(device);
  }

  async remove(id: string): Promise<boolean> {
    const res = await this._repo.delete(id);
    return (res.affected ?? 0) > 0;
  }

  async markSeen(id: string, when: Date): Promise<void> {
    await this._repo.update(id, { lastSeenAt: when });
  }

  /**
   * One-time bootstrap: if no devices exist yet and ARANET_DEVICES is set
   * ("MAC=type,MAC=type"), create them so a fresh deploy works without manual
   * API calls. After that, devices are managed via the API.
   */
  async seedFromEnv(): Promise<void> {
    const count = await this._repo.count();
    if (count > 0) return;

    const raw = process.env.ARANET_DEVICES;
    if (!raw) return;

    for (const entry of raw.split(',').map((e) => e.trim()).filter(Boolean)) {
      const [mac, type] = entry.split('=').map((s) => s.trim());
      if (!mac || (type !== 'co2' && type !== 'radon')) continue;
      try {
        const device = await this.add({ macAddress: mac, type });
        console.log(`➕ Seeded device ${device.macAddress} (${device.type})`);
      } catch (err) {
        console.error(`Failed to seed device "${entry}":`, err);
      }
    }
  }
}
