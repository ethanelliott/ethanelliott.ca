export type MeasurementType =
  | 'co2'
  | 'radon'
  | 'temperature'
  | 'humidity'
  | 'pressure'
  | 'battery'
  | 'status';

export type DeviceType = 'co2' | 'radon';

export interface Device {
  id: string;
  macAddress: string;
  name: string;
  type: DeviceType;
  enabled: boolean;
  lastSeenAt: string | null;
  createdAt: string;
}

export interface Measurement {
  id: string;
  type: MeasurementType;
  value: number;
}

export interface Reading {
  id: string;
  device: Device;
  measuredAt: string;
  recordedAt: string;
  measurements: Measurement[];
}

export interface SeriesPoint {
  t: string;
  v: number;
}

export interface SeriesPage {
  deviceId: string;
  type: MeasurementType;
  unit: string;
  from: string;
  to: string;
  nextBefore: string;
  hasMore: boolean;
  count: number;
  capped: boolean;
  points: SeriesPoint[];
}
