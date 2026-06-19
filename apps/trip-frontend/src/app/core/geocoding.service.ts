import { Injectable } from '@angular/core';

export interface GeocodeResult {
  label: string;
  lat: number;
  lng: number;
}

/**
 * Thin client for OpenStreetMap's Nominatim geocoder. Called directly from the
 * browser (Nominatim sends permissive CORS headers and the browser supplies a
 * Referer, satisfying the usage policy). Keep calls debounced — the policy
 * allows roughly one request per second.
 */
@Injectable({ providedIn: 'root' })
export class GeocodingService {
  private readonly endpoint = 'https://nominatim.openstreetmap.org/search';

  async search(query: string): Promise<GeocodeResult[]> {
    const q = query.trim();
    if (q.length < 3) return [];

    const params = new URLSearchParams({
      q,
      format: 'jsonv2',
      addressdetails: '0',
      limit: '6',
    });

    const res = await fetch(`${this.endpoint}?${params.toString()}`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return [];

    const data = (await res.json()) as Array<{
      display_name: string;
      lat: string;
      lon: string;
    }>;

    return data.map((d) => ({
      label: d.display_name,
      lat: parseFloat(d.lat),
      lng: parseFloat(d.lon),
    }));
  }
}
