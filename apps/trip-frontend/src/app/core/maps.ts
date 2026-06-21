export interface MapPlace {
  lat?: number | null;
  lng?: number | null;
  query?: string | null;
}

/**
 * Build a Google Maps URL that shows a place (drops a pin), letting the user
 * decide what to do from there. Prefers exact coordinates, falling back to a
 * text query (a place label, or "City, Country"). Returns null when there's
 * nothing to point at. Opens in the Google Maps app or web.
 */
export function placeUrl(place: MapPlace): string | null {
  const { lat, lng, query } = place;
  if (lat != null && lng != null) {
    return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  }
  const q = query?.trim();
  if (q) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
  }
  return null;
}
