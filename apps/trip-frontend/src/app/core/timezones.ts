// IANA timezone options for the timezone selects. Uses the platform list
// when available (all modern browsers), with a small fallback otherwise.
export interface TimezoneOption {
  label: string;
  value: string;
}

const FALLBACK = [
  'UTC',
  'America/Toronto',
  'America/New_York',
  'America/Halifax',
  'America/Vancouver',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Brussels',
  'Europe/Amsterdam',
  'Europe/Rome',
  'Asia/Tokyo',
  'Australia/Sydney',
];

export function timezoneOptions(): TimezoneOption[] {
  const supported = (
    Intl as unknown as { supportedValuesOf?: (k: string) => string[] }
  ).supportedValuesOf;
  const zones = supported ? supported('timeZone') : FALLBACK;
  return zones.map((z) => ({ label: z.replace(/_/g, ' '), value: z }));
}
