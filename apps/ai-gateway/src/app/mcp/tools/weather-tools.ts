import { createTool, getToolRegistry } from '../tool-registry';

/** ─── helpers ────────────────────────────────────────────────── */

interface GeoResult {
  lat: number;
  lon: number;
  name: string;
  country: string;
}

async function geocode(location: string): Promise<GeoResult | null> {
  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
      location
    )}&count=1&language=en&format=json`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!resp.ok) return null;
    const data = (await resp.json()) as {
      results?: {
        latitude: number;
        longitude: number;
        name: string;
        country: string;
      }[];
    };
    const r = data.results?.[0];
    if (!r) return null;
    return {
      lat: r.latitude,
      lon: r.longitude,
      name: r.name,
      country: r.country,
    };
  } catch {
    return null;
  }
}

const WMO_CODES: Record<number, string> = {
  0: 'Clear sky',
  1: 'Mainly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Foggy',
  48: 'Icy fog',
  51: 'Light drizzle',
  53: 'Moderate drizzle',
  55: 'Dense drizzle',
  61: 'Slight rain',
  63: 'Moderate rain',
  65: 'Heavy rain',
  71: 'Slight snow',
  73: 'Moderate snow',
  75: 'Heavy snow',
  77: 'Snow grains',
  80: 'Slight showers',
  81: 'Moderate showers',
  82: 'Violent showers',
  85: 'Slight snow showers',
  86: 'Heavy snow showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm with hail',
  99: 'Thunderstorm with heavy hail',
};

function wmoLabel(code: number): string {
  return WMO_CODES[code] ?? `Unknown (${code})`;
}

/** ─── get_current_weather ────────────────────────────────────── */

const getCurrentWeather = createTool(
  {
    name: 'get_current_weather',
    description:
      'Get current weather conditions for a location (temperature, feels-like, humidity, wind, precipitation, conditions). Uses Open-Meteo (free, no key needed).',
    category: 'weather',
    tags: ['weather', 'current'],
    parameters: {
      type: 'object',
      properties: {
        location: {
          type: 'string',
          description: 'City name or "lat,lon" coordinates',
        },
        units: {
          type: 'string',
          description: 'Temperature units: "celsius" (default) or "fahrenheit"',
          enum: ['celsius', 'fahrenheit'],
        },
      },
      required: ['location'],
    },
  },
  async (params) => {
    const loc = params.location as string;
    const unitSystem = (params.units as string) || 'celsius';
    const tempUnit = unitSystem === 'fahrenheit' ? 'fahrenheit' : 'celsius';

    let lat: number, lon: number, locationName: string;
    const coordMatch = loc.match(/^(-?\d+\.?\d*),\s*(-?\d+\.?\d*)$/);
    if (coordMatch) {
      lat = parseFloat(coordMatch[1]);
      lon = parseFloat(coordMatch[2]);
      locationName = loc;
    } else {
      const geo = await geocode(loc);
      if (!geo)
        return { success: false, error: `Cannot geocode location: "${loc}"` };
      lat = geo.lat;
      lon = geo.lon;
      locationName = `${geo.name}, ${geo.country}`;
    }

    try {
      const url =
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
        `&current=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,` +
        `wind_speed_10m,wind_direction_10m,wind_gusts_10m,weather_code,cloud_cover,` +
        `surface_pressure,visibility,is_day` +
        `&temperature_unit=${tempUnit}&wind_speed_unit=kmh&precipitation_unit=mm&timezone=auto`;

      const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!resp.ok) {
        return {
          success: false,
          error: `Open-Meteo API error: ${resp.status}`,
        };
      }
      const data = (await resp.json()) as any;
      const c = data.current;
      const tu = tempUnit === 'fahrenheit' ? '°F' : '°C';

      return {
        success: true,
        data: {
          location: locationName,
          coordinates: { lat, lon },
          conditions: wmoLabel(c.weather_code),
          temperature: `${c.temperature_2m}${tu}`,
          feelsLike: `${c.apparent_temperature}${tu}`,
          humidity: `${c.relative_humidity_2m}%`,
          precipitation: `${c.precipitation} mm`,
          wind: `${c.wind_speed_10m} km/h from ${c.wind_direction_10m}°, gusts ${c.wind_gusts_10m} km/h`,
          cloudCover: `${c.cloud_cover}%`,
          pressure: `${c.surface_pressure} hPa`,
          isDay: c.is_day === 1,
          updatedAt: c.time,
        },
      };
    } catch (err) {
      return {
        success: false,
        error: `Weather fetch failed: ${
          err instanceof Error ? err.message : err
        }`,
      };
    }
  }
);

/** ─── get_hourly_forecast ────────────────────────────────────── */

const getHourlyForecast = createTool(
  {
    name: 'get_hourly_forecast',
    description: 'Get hour-by-hour forecast for the next 24–48 hours.',
    category: 'weather',
    tags: ['weather', 'forecast', 'hourly'],
    parameters: {
      type: 'object',
      properties: {
        location: { type: 'string', description: 'City name or "lat,lon"' },
        hours: {
          type: 'number',
          description: 'Number of hours ahead (default: 24, max: 48)',
        },
        units: { type: 'string', enum: ['celsius', 'fahrenheit'] },
      },
      required: ['location'],
    },
  },
  async (params) => {
    const loc = params.location as string;
    const hours = Math.min((params.hours as number) || 24, 48);
    const tempUnit =
      (params.units as string) === 'fahrenheit' ? 'fahrenheit' : 'celsius';
    const tu = tempUnit === 'fahrenheit' ? '°F' : '°C';

    const geo = await geocode(loc);
    if (!geo) return { success: false, error: `Cannot geocode: "${loc}"` };

    try {
      const url =
        `https://api.open-meteo.com/v1/forecast?latitude=${geo.lat}&longitude=${geo.lon}` +
        `&hourly=temperature_2m,apparent_temperature,precipitation_probability,precipitation,` +
        `wind_speed_10m,wind_gusts_10m,weather_code` +
        `&temperature_unit=${tempUnit}&wind_speed_unit=kmh&precipitation_unit=mm&timezone=auto&forecast_hours=${hours}`;

      const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!resp.ok)
        return { success: false, error: `API error: ${resp.status}` };
      const data = (await resp.json()) as any;
      const h = data.hourly;

      const forecast = h.time.slice(0, hours).map((t: string, i: number) => ({
        time: t,
        temperature: `${h.temperature_2m[i]}${tu}`,
        feelsLike: `${h.apparent_temperature[i]}${tu}`,
        precipProbability: `${h.precipitation_probability[i]}%`,
        precipitation: `${h.precipitation[i]} mm`,
        wind: `${h.wind_speed_10m[i]} km/h, gusts ${h.wind_gusts_10m[i]} km/h`,
        conditions: wmoLabel(h.weather_code[i]),
      }));

      return {
        success: true,
        data: {
          location: `${geo.name}, ${geo.country}`,
          hours,
          forecast,
        },
      };
    } catch (err) {
      return {
        success: false,
        error: `Fetch failed: ${err instanceof Error ? err.message : err}`,
      };
    }
  }
);

/** ─── get_daily_forecast ─────────────────────────────────────── */

const getDailyForecast = createTool(
  {
    name: 'get_daily_forecast',
    description:
      '7-day daily weather forecast with high/low, precipitation chance, and dominant conditions.',
    category: 'weather',
    tags: ['weather', 'forecast', 'daily'],
    parameters: {
      type: 'object',
      properties: {
        location: { type: 'string', description: 'City name or "lat,lon"' },
        days: {
          type: 'number',
          description: 'Number of days (default: 7, max: 16)',
        },
        units: { type: 'string', enum: ['celsius', 'fahrenheit'] },
      },
      required: ['location'],
    },
  },
  async (params) => {
    const loc = params.location as string;
    const days = Math.min((params.days as number) || 7, 16);
    const tempUnit =
      (params.units as string) === 'fahrenheit' ? 'fahrenheit' : 'celsius';
    const tu = tempUnit === 'fahrenheit' ? '°F' : '°C';

    const geo = await geocode(loc);
    if (!geo) return { success: false, error: `Cannot geocode: "${loc}"` };

    try {
      const url =
        `https://api.open-meteo.com/v1/forecast?latitude=${geo.lat}&longitude=${geo.lon}` +
        `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,` +
        `wind_speed_10m_max,weather_code,sunrise,sunset` +
        `&temperature_unit=${tempUnit}&wind_speed_unit=kmh&precipitation_unit=mm&timezone=auto&forecast_days=${days}`;

      const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!resp.ok)
        return { success: false, error: `API error: ${resp.status}` };
      const data = (await resp.json()) as any;
      const d = data.daily;

      const forecast = d.time.map((t: string, i: number) => ({
        date: t,
        high: `${d.temperature_2m_max[i]}${tu}`,
        low: `${d.temperature_2m_min[i]}${tu}`,
        precipitationMm: d.precipitation_sum[i],
        precipProbability: `${d.precipitation_probability_max[i]}%`,
        maxWind: `${d.wind_speed_10m_max[i]} km/h`,
        conditions: wmoLabel(d.weather_code[i]),
        sunrise: d.sunrise[i],
        sunset: d.sunset[i],
      }));

      return {
        success: true,
        data: { location: `${geo.name}, ${geo.country}`, days, forecast },
      };
    } catch (err) {
      return {
        success: false,
        error: `Fetch failed: ${err instanceof Error ? err.message : err}`,
      };
    }
  }
);

/** ─── get_air_quality ─────────────────────────────────────────── */

const getAirQuality = createTool(
  {
    name: 'get_air_quality',
    description:
      'Get current air quality index and pollutant levels (AQI, PM2.5, PM10, O3, NO2).',
    category: 'weather',
    tags: ['air', 'quality', 'health'],
    parameters: {
      type: 'object',
      properties: {
        location: { type: 'string', description: 'City name or "lat,lon"' },
      },
      required: ['location'],
    },
  },
  async (params) => {
    const geo = await geocode(params.location as string);
    if (!geo)
      return { success: false, error: `Cannot geocode: "${params.location}"` };

    try {
      const url =
        `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${geo.lat}&longitude=${geo.lon}` +
        `&current=us_aqi,pm2_5,pm10,ozone,nitrogen_dioxide,carbon_monoxide&timezone=auto`;

      const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!resp.ok)
        return { success: false, error: `API error: ${resp.status}` };
      const data = (await resp.json()) as any;
      const c = data.current;

      const aqiLabel = (aqi: number) => {
        if (aqi <= 50) return 'Good';
        if (aqi <= 100) return 'Moderate';
        if (aqi <= 150) return 'Unhealthy for Sensitive Groups';
        if (aqi <= 200) return 'Unhealthy';
        if (aqi <= 300) return 'Very Unhealthy';
        return 'Hazardous';
      };

      return {
        success: true,
        data: {
          location: `${geo.name}, ${geo.country}`,
          usAqi: c.us_aqi,
          aqiCategory: aqiLabel(c.us_aqi),
          pm2_5: `${c.pm2_5} μg/m³`,
          pm10: `${c.pm10} μg/m³`,
          ozone: `${c.ozone} μg/m³`,
          no2: `${c.nitrogen_dioxide} μg/m³`,
          co: `${c.carbon_monoxide} μg/m³`,
          updatedAt: c.time,
        },
      };
    } catch (err) {
      return {
        success: false,
        error: `Fetch failed: ${err instanceof Error ? err.message : err}`,
      };
    }
  }
);

/** ─── get_uv_index ───────────────────────────────────────────── */

const getUvIndex = createTool(
  {
    name: 'get_uv_index',
    description:
      'Current and peak UV index for a location, with burn time estimate.',
    category: 'weather',
    tags: ['uv', 'sun', 'health'],
    parameters: {
      type: 'object',
      properties: {
        location: { type: 'string', description: 'City name or "lat,lon"' },
      },
      required: ['location'],
    },
  },
  async (params) => {
    const geo = await geocode(params.location as string);
    if (!geo)
      return { success: false, error: `Cannot geocode: "${params.location}"` };

    try {
      const url =
        `https://api.open-meteo.com/v1/forecast?latitude=${geo.lat}&longitude=${geo.lon}` +
        `&current=uv_index,uv_index_clear_sky&daily=uv_index_max&timezone=auto&forecast_days=1`;

      const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!resp.ok)
        return { success: false, error: `API error: ${resp.status}` };
      const data = (await resp.json()) as any;
      const uv = data.current.uv_index;
      const uvMax = data.daily?.uv_index_max?.[0] ?? uv;

      const burnMinutes = (uvi: number): string => {
        if (uvi <= 0) return 'N/A (night)';
        const base = 200 / uvi; // rough estimate for skin type II
        return `~${Math.round(base)} min (fair skin)`;
      };

      const uvCategory = (uvi: number) => {
        if (uvi < 3) return 'Low';
        if (uvi < 6) return 'Moderate';
        if (uvi < 8) return 'High';
        if (uvi < 11) return 'Very High';
        return 'Extreme';
      };

      return {
        success: true,
        data: {
          location: `${geo.name}, ${geo.country}`,
          currentUvIndex: uv,
          peakUvIndex: uvMax,
          category: uvCategory(uvMax),
          estimatedBurnTime: burnMinutes(uvMax),
          tip:
            uvMax >= 6
              ? 'Apply SPF 30+ sunscreen and seek shade midday.'
              : 'Sunscreen recommended for prolonged outdoor exposure.',
        },
      };
    } catch (err) {
      return {
        success: false,
        error: `Fetch failed: ${err instanceof Error ? err.message : err}`,
      };
    }
  }
);

/** ─── get_astronomical_data ──────────────────────────────────── */

const getAstronomicalData = createTool(
  {
    name: 'get_astronomical_data',
    description:
      'Get sunrise, sunset, golden hour, moonrise, moon phase for a location and date.',
    category: 'weather',
    tags: ['astronomy', 'sun', 'moon'],
    parameters: {
      type: 'object',
      properties: {
        location: { type: 'string', description: 'City name or "lat,lon"' },
        date: {
          type: 'string',
          description: 'Date (ISO 8601, default: today)',
        },
      },
      required: ['location'],
    },
  },
  async (params) => {
    const geo = await geocode(params.location as string);
    if (!geo)
      return { success: false, error: `Cannot geocode: "${params.location}"` };

    const dateStr = params.date
      ? new Date(params.date as string).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0];

    try {
      const url =
        `https://api.open-meteo.com/v1/forecast?latitude=${geo.lat}&longitude=${geo.lon}` +
        `&daily=sunrise,sunset,daylight_duration&timezone=auto&start_date=${dateStr}&end_date=${dateStr}`;

      const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!resp.ok)
        return { success: false, error: `API error: ${resp.status}` };
      const data = (await resp.json()) as any;

      const sunrise = data.daily?.sunrise?.[0] ?? 'N/A';
      const sunset = data.daily?.sunset?.[0] ?? 'N/A';
      const daylight = data.daily?.daylight_duration?.[0]; // seconds
      const daylightHours = daylight
        ? `${(daylight / 3600).toFixed(1)} hours`
        : 'N/A';

      // Compute golden hour (approx: 1 hour after sunrise, 1 hour before sunset)
      const toGolden = (iso: string, direction: 'after' | 'before') => {
        try {
          const d = new Date(iso);
          if (direction === 'after')
            return new Date(d.getTime() + 3600000).toISOString();
          return new Date(d.getTime() - 3600000).toISOString();
        } catch {
          return 'N/A';
        }
      };

      return {
        success: true,
        data: {
          location: `${geo.name}, ${geo.country}`,
          date: dateStr,
          sunrise,
          morningGoldenHourEnd: toGolden(sunrise, 'after'),
          eveningGoldenHourStart: toGolden(sunset, 'before'),
          sunset,
          daylightDuration: daylightHours,
          note: 'Moon phase not available via Open-Meteo. For moon data, use a dedicated astronomical API.',
        },
      };
    } catch (err) {
      return {
        success: false,
        error: `Fetch failed: ${err instanceof Error ? err.message : err}`,
      };
    }
  }
);

/** ─── compare_locations_weather ──────────────────────────────── */

const compareLocationsWeather = createTool(
  {
    name: 'compare_locations_weather',
    description:
      'Side-by-side current weather comparison for multiple cities (travel planning).',
    category: 'weather',
    tags: ['weather', 'compare', 'travel'],
    parameters: {
      type: 'object',
      properties: {
        locations: {
          type: 'array',
          description:
            'List of city names or "lat,lon" strings (2–5 locations)',
          items: { type: 'string', description: 'Location' },
        },
        units: { type: 'string', enum: ['celsius', 'fahrenheit'] },
      },
      required: ['locations'],
    },
  },
  async (params) => {
    const locs = (params.locations as string[]).slice(0, 5);
    const tempUnit =
      (params.units as string) === 'fahrenheit' ? 'fahrenheit' : 'celsius';
    const tu = tempUnit === 'fahrenheit' ? '°F' : '°C';

    const results = await Promise.all(
      locs.map(async (loc) => {
        const geo = await geocode(loc);
        if (!geo) return { location: loc, error: 'Geocoding failed' };
        try {
          const url =
            `https://api.open-meteo.com/v1/forecast?latitude=${geo.lat}&longitude=${geo.lon}` +
            `&current=temperature_2m,apparent_temperature,weather_code,precipitation,wind_speed_10m` +
            `&temperature_unit=${tempUnit}&wind_speed_unit=kmh&timezone=auto`;
          const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
          if (!resp.ok)
            return {
              location: `${geo.name}, ${geo.country}`,
              error: `API ${resp.status}`,
            };
          const data = (await resp.json()) as any;
          const c = data.current;
          return {
            location: `${geo.name}, ${geo.country}`,
            temperature: `${c.temperature_2m}${tu}`,
            feelsLike: `${c.apparent_temperature}${tu}`,
            conditions: wmoLabel(c.weather_code),
            precipitation: `${c.precipitation} mm`,
            wind: `${c.wind_speed_10m} km/h`,
          };
        } catch (err) {
          return {
            location: `${geo.name}, ${geo.country}`,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      })
    );

    return { success: true, data: { comparison: results } };
  }
);

// Register all weather tools
const registry = getToolRegistry();
registry.register(getCurrentWeather);
registry.register(getHourlyForecast);
registry.register(getDailyForecast);
registry.register(getAirQuality);
registry.register(getUvIndex);
registry.register(getAstronomicalData);
registry.register(compareLocationsWeather);

export {
  getCurrentWeather,
  getHourlyForecast,
  getDailyForecast,
  getAirQuality,
  getUvIndex,
  getAstronomicalData,
  compareLocationsWeather,
};
