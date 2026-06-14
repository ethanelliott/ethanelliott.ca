/**
 * Pure decoder for Aranet BLE advertisement (broadcast) manufacturer data.
 *
 * Aranet devices advertise current readings under the SAF Tehnika company id
 * 0x0702 (1794) when "Smart Home integrations" is enabled in the Aranet app.
 * This module decodes the manufacturer-specific bytes (the company id is
 * already stripped by BlueZ before we see them).
 *
 * Byte layout (offsets into the manufacturer-specific buffer), verified
 * against live readings from the physical devices:
 *
 *   Aranet4 (CO2):
 *     u16@8  CO2 (ppm)
 *     u16@10 temperature (raw * 0.05 °C)
 *     u16@12 pressure    (raw * 0.1 hPa)
 *     u8@14  humidity (%)
 *     u8@15  battery (%)
 *     u8@16  status (1=green, 2=yellow, 3=red)
 *     u16@17 interval (s)   u16@19 age (s)
 *
 *   Aranet Radon:
 *     u8@0   version (== 3)
 *     u16@8  radon concentration (Bq/m3)
 *     u16@10 temperature (raw * 0.05 °C)
 *     u16@12 pressure    (raw * 0.1 hPa)
 *     u16@14 humidity (raw * 0.1 %)
 *     u8@17  battery (%)
 *     u8@18  status
 *     u16@19 interval (s)   u16@21 age (s)
 */

export type AranetDeviceType = 'co2' | 'radon';

export interface AranetReading {
  /** ppm, or null for non-CO2 devices */
  co2: number | null;
  /** Bq/m3, or null for non-radon devices */
  radon: number | null;
  /** °C */
  temperature: number;
  /** % relative humidity */
  humidity: number;
  /** hPa */
  pressure: number;
  /** % */
  battery: number;
  /** 1 = green, 2 = yellow, 3 = red */
  status: number;
  /** measurement interval in seconds */
  interval: number;
  /** seconds elapsed since this measurement was taken */
  age: number;
}

/** SAF Tehnika company identifier used by all Aranet devices. */
export const ARANET_MANUFACTURER_ID = 0x0702; // 1794

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Decode an Aranet manufacturer-data buffer into a reading, or `null` if the
 * buffer is too short / not a broadcast payload (e.g. integrations disabled,
 * in which case the device advertises only its name).
 */
export function parseAranetManufacturerData(
  type: AranetDeviceType,
  raw: Buffer
): AranetReading | null {
  // A name-only advertisement carries no readings.
  if (raw.length < 17) return null;

  // Temperature is a 14-bit value; the top two bits are flags.
  const temperature = round1((raw.readUInt16LE(10) & 0x3fff) * 0.05);
  const pressure = round1(raw.readUInt16LE(12) * 0.1);

  if (type === 'co2') {
    return {
      co2: raw.readUInt16LE(8),
      radon: null,
      temperature,
      pressure,
      humidity: raw.readUInt8(14),
      battery: raw.readUInt8(15),
      status: raw.readUInt8(16),
      interval: raw.length >= 19 ? raw.readUInt16LE(17) : 0,
      age: raw.length >= 21 ? raw.readUInt16LE(19) : 0,
    };
  }

  // radon
  if (raw.length < 19) return null;
  return {
    co2: null,
    radon: raw.readUInt16LE(8),
    temperature,
    pressure,
    humidity: round1(raw.readUInt16LE(14) * 0.1),
    battery: raw.readUInt8(17),
    status: raw.readUInt8(18),
    interval: raw.length >= 21 ? raw.readUInt16LE(19) : 0,
    age: raw.length >= 23 ? raw.readUInt16LE(21) : 0,
  };
}
