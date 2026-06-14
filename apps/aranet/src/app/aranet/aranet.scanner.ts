import { createBluetooth } from 'node-ble';
import {
  AranetDeviceType,
  AranetReading,
  ARANET_MANUFACTURER_ID,
  parseAranetManufacturerData,
} from './aranet.parser';

export interface AranetTarget {
  mac: string;
  type: AranetDeviceType;
}

export interface DiscoveredDevice {
  macAddress: string;
  name: string;
  /** Inferred from the advertised name; null if it can't be determined. */
  type: AranetDeviceType | null;
  rssi: number | null;
  /** True when the device is broadcasting decodable readings (integrations on). */
  broadcasting: boolean;
  reading: AranetReading | null;
}

export interface ScannedReading {
  deviceId: string;
  deviceName: string;
  type: AranetDeviceType;
  reading: AranetReading;
  rssi: number | null;
  /** Raw manufacturer-data hex — logged on first sighting for verification. */
  rawHex: string;
}

/**
 * Talks to the host's BlueZ daemon over the system D-Bus socket (no raw HCI
 * access, no pairing, no GATT connection). BlueZ caches each device's
 * advertisement `ManufacturerData` during passive discovery, which is exactly
 * what we read here.
 */
export class AranetScanner {
  private _destroy: (() => void) | null = null;
  private _adapter: any = null;

  async init(): Promise<void> {
    const { bluetooth, destroy } = createBluetooth();
    this._destroy = destroy;
    this._adapter = await bluetooth.defaultAdapter();

    if (!(await this._adapter.isPowered())) {
      await this._adapter.setPowered(true);
    }
    if (!(await this._adapter.isDiscovering())) {
      await this._adapter.startDiscovery();
    }
    console.log('📡 BlueZ discovery started');
  }

  /** Read the latest cached advertisement for each target device. */
  async poll(targets: AranetTarget[]): Promise<ScannedReading[]> {
    const out: ScannedReading[] = [];

    for (const target of targets) {
      try {
        const device = await this._adapter.getDevice(target.mac);
        const mfg = await device.getManufacturerData();
        const raw = extractManufacturerBuffer(mfg, ARANET_MANUFACTURER_ID);
        if (!raw) continue;

        const reading = parseAranetManufacturerData(target.type, raw);
        if (!reading) continue;

        out.push({
          deviceId: target.mac,
          deviceName: await safeGet(() => device.getName(), target.mac),
          type: target.type,
          reading,
          rssi: await safeGet(() => device.getRSSI(), null),
          rawHex: raw.toString('hex'),
        });
      } catch {
        // Device not yet (re)discovered this cycle — skip; it'll reappear.
      }
    }

    return out;
  }

  /**
   * Enumerate every BLE device BlueZ currently sees and return the Aranet ones
   * (matched by manufacturer id or an "Aranet…" name). Used by the scan
   * endpoint to help discover devices to add.
   */
  async discoverAranet(): Promise<DiscoveredDevice[]> {
    if (!this._adapter) return [];

    const macs: string[] = await this._adapter.devices();
    const found: DiscoveredDevice[] = [];

    for (const mac of macs) {
      try {
        const device = await this._adapter.getDevice(mac);
        const name = await safeGet(() => device.getName(), '');
        const mfg = await safeGet<any>(() => device.getManufacturerData(), null);
        const raw = extractManufacturerBuffer(mfg, ARANET_MANUFACTURER_ID);

        const looksAranet = raw != null || /^aranet/i.test(name);
        if (!looksAranet) continue;

        const type = inferAranetType(name, raw);
        const reading = raw && type ? parseAranetManufacturerData(type, raw) : null;

        found.push({
          macAddress: mac.toUpperCase(),
          name,
          type,
          rssi: await safeGet(() => device.getRSSI(), null),
          broadcasting: reading != null,
          reading,
        });
      } catch {
        // device vanished mid-enumeration — skip
      }
    }

    // Strongest signal first.
    found.sort((a, b) => (b.rssi ?? -999) - (a.rssi ?? -999));
    return found;
  }

  async stop(): Promise<void> {
    try {
      if (this._adapter && (await this._adapter.isDiscovering())) {
        await this._adapter.stopDiscovery();
      }
    } catch {
      // best effort
    }
    this._destroy?.();
    this._destroy = null;
    this._adapter = null;
  }
}

/** Infer device type from advertised name (with a weak version-byte fallback). */
function inferAranetType(
  name: string,
  raw: Buffer | null
): AranetDeviceType | null {
  const n = (name || '').toLowerCase();
  if (n.includes('radon') || n.includes('aranetrn')) return 'radon';
  if (n.includes('aranet4')) return 'co2';
  // Radon broadcasts carry a version byte of 3 at offset 0; Aranet4 does not
  // reliably, so only trust this for radon.
  if (raw && raw.length > 0 && raw[0] === 3) return 'radon';
  return null;
}

async function safeGet<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

/**
 * node-ble returns ManufacturerData as a map of company id → value. Depending
 * on version the value may be a Buffer, a byte array, or a `{ value }`
 * wrapper — normalise all of them to a Buffer.
 */
function extractManufacturerBuffer(mfg: any, id: number): Buffer | null {
  if (!mfg) return null;
  const value = mfg[id] ?? mfg[String(id)];
  if (!value) return null;

  const candidate = value?.value ?? value;
  if (Buffer.isBuffer(candidate)) return candidate;
  if (Array.isArray(candidate)) return Buffer.from(candidate);
  if (candidate?.data && Array.isArray(candidate.data)) {
    return Buffer.from(candidate.data);
  }
  return null;
}
