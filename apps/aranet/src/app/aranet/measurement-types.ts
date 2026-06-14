import { AranetReading } from './aranet.parser';

/** The kinds of values a single reading can carry. */
export type MeasurementType =
  | 'co2'
  | 'radon'
  | 'temperature'
  | 'humidity'
  | 'pressure'
  | 'battery'
  | 'status';

/** Unit for each measurement type, handy for dashboards/labels. */
export const MEASUREMENT_UNITS: Record<MeasurementType, string> = {
  co2: 'ppm',
  radon: 'Bq/m3',
  temperature: '°C',
  humidity: '%',
  pressure: 'hPa',
  battery: '%',
  status: '', // 1=green, 2=yellow, 3=red
};

/** Explode a decoded reading into individual typed measurements. */
export function readingToMeasurements(
  reading: AranetReading
): Array<{ type: MeasurementType; value: number }> {
  const out: Array<{ type: MeasurementType; value: number }> = [];
  if (reading.co2 != null) out.push({ type: 'co2', value: reading.co2 });
  if (reading.radon != null) out.push({ type: 'radon', value: reading.radon });
  out.push({ type: 'temperature', value: reading.temperature });
  out.push({ type: 'humidity', value: reading.humidity });
  out.push({ type: 'pressure', value: reading.pressure });
  out.push({ type: 'battery', value: reading.battery });
  out.push({ type: 'status', value: reading.status });
  return out;
}
