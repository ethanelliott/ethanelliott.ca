export interface MapPlace {
  lat?: number | null;
  lng?: number | null;
  query?: string | null;
}

/**
 * Build a Google Maps directions URL to a place. Prefers exact coordinates,
 * falling back to a text query (a place label, or "City, Country"). Returns
 * null when there's nothing to point at. Opens directions (with the user's
 * current location as the origin) in the Google Maps app or web.
 */
export function directionsUrl(place: MapPlace): string | null {
  const { lat, lng, query } = place;
  if (lat != null && lng != null) {
    return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
  }
  const q = query?.trim();
  if (q) {
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(q)}`;
  }
  return null;
}
