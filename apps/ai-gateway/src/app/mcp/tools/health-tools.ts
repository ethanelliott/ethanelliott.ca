import { createTool, getToolRegistry } from '../tool-registry';

/** ─── env config ───────────────────────────────────────────────── */

const WHOOP_TOKEN = process.env['WHOOP_ACCESS_TOKEN'];
const WHOOP_BASE = 'https://api.prod.whoop.com/developer';
const NTFY_URL = process.env['NTFY_URL'];
const NTFY_TOPIC = process.env['NTFY_TOPIC'] || 'ai-gateway';

/** ─── in-memory health logs ────────────────────────────────────── */

interface WaterLog {
  date: string;
  totalMl: number;
  targetMl: number;
  entries: { time: string; ml: number }[];
}

interface SleepLog {
  date: string;
  hoursSlept: number;
  quality: string;
  notes?: string;
}

interface ExerciseLog {
  date: string;
  type: string;
  durationMinutes: number;
  notes?: string;
}

const waterLogs: Map<string, WaterLog> = new Map();
const sleepLogs: SleepLog[] = [];
const exerciseLogs: ExerciseLog[] = [];
const WATER_TARGET_ML = 2500;

function todayStr(): string {
  return new Date().toISOString().split('T')[0];
}

/** ─── Whoop helpers ─────────────────────────────────────────────── */

async function whoopGet(path: string) {
  if (!WHOOP_TOKEN) throw new Error('WHOOP_ACCESS_TOKEN not set');
  const resp = await fetch(`${WHOOP_BASE}${path}`, {
    headers: { Authorization: `Bearer ${WHOOP_TOKEN}` },
    signal: AbortSignal.timeout(10000),
  });
  if (resp.status === 401) throw new Error('WHOOP token invalid or expired');
  if (!resp.ok) throw new Error(`WHOOP API ${resp.status}: ${resp.statusText}`);
  return resp.json();
}

/** ─── lookup_nutrition ──────────────────────────────────────────── */

const lookupNutrition = createTool(
  {
    name: 'lookup_nutrition',
    description:
      'Get nutritional information for a food item (calories, macros, micros) via Open Food Facts.',
    category: 'health',
    tags: ['nutrition', 'food', 'calories'],
    parameters: {
      type: 'object',
      properties: {
        food: {
          type: 'string',
          description: 'Food name or product to look up',
        },
        serving_size: {
          type: 'string',
          description: 'Serving size description (informational)',
        },
      },
      required: ['food'],
    },
  },
  async (params) => {
    const food = params.food as string;
    try {
      const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(
        food
      )}&search_simple=1&action=process&json=1&page_size=3`;
      const resp = await fetch(url, {
        headers: {
          'User-Agent': 'AI-Gateway/1.0 (contact: admin@ethanelliott.ca)',
        },
        signal: AbortSignal.timeout(12000),
      });
      if (!resp.ok)
        return {
          success: false,
          error: `Open Food Facts error: ${resp.status}`,
        };
      const data = (await resp.json()) as any;
      const products = (data.products || []).slice(0, 3);

      if (products.length === 0) {
        return {
          success: false,
          error: `No nutrition data found for "${food}"`,
        };
      }

      const results = products.map((p: any) => ({
        name: p.product_name || p.product_name_en || food,
        brand: p.brands,
        per100g: {
          calories: p.nutriments?.['energy-kcal_100g'],
          carbs: p.nutriments?.carbohydrates_100g,
          protein: p.nutriments?.proteins_100g,
          fat: p.nutriments?.fat_100g,
          fiber: p.nutriments?.fiber_100g,
          sugar: p.nutriments?.sugars_100g,
          sodium: p.nutriments?.sodium_100g,
        },
        servingSize: p.serving_size,
        grade: p.nutrition_grades,
      }));

      return {
        success: true,
        data: {
          query: food,
          servingSize: params.serving_size,
          results,
          note: 'Values are per 100g unless serving size data is available.',
        },
      };
    } catch (err) {
      return {
        success: false,
        error: `Nutrition lookup failed: ${
          err instanceof Error ? err.message : err
        }`,
      };
    }
  }
);

/** ─── log_water ─────────────────────────────────────────────────── */

const logWater = createTool(
  {
    name: 'log_water',
    description: 'Log a water intake entry for today.',
    category: 'health',
    tags: ['water', 'hydration'],
    parameters: {
      type: 'object',
      properties: {
        amount_ml: {
          type: 'number',
          description: 'Amount of water in millilitres (e.g. 250 for a cup)',
        },
      },
      required: ['amount_ml'],
    },
  },
  async (params) => {
    const ml = params.amount_ml as number;
    const today = todayStr();

    if (!waterLogs.has(today)) {
      waterLogs.set(today, {
        date: today,
        totalMl: 0,
        targetMl: WATER_TARGET_ML,
        entries: [],
      });
    }
    const log = waterLogs.get(today)!;
    log.entries.push({ time: new Date().toISOString(), ml });
    log.totalMl += ml;

    return {
      success: true,
      data: {
        logged: `${ml} ml`,
        totalToday: `${log.totalMl} ml`,
        target: `${WATER_TARGET_ML} ml`,
        remaining: `${Math.max(0, WATER_TARGET_ML - log.totalMl)} ml`,
        percentage: `${Math.min(
          100,
          Math.round((log.totalMl / WATER_TARGET_ML) * 100)
        )}%`,
      },
    };
  }
);

/** ─── get_water_status ──────────────────────────────────────────── */

const getWaterStatus = createTool(
  {
    name: 'get_water_status',
    description: "Get today's water intake status vs daily target.",
    category: 'health',
    tags: ['water', 'hydration'],
    parameters: { type: 'object', properties: {} },
  },
  async () => {
    const today = todayStr();
    const log = waterLogs.get(today) || {
      date: today,
      totalMl: 0,
      targetMl: WATER_TARGET_ML,
      entries: [],
    };
    return {
      success: true,
      data: {
        date: today,
        totalMl: log.totalMl,
        targetMl: WATER_TARGET_ML,
        remaining: Math.max(0, WATER_TARGET_ML - log.totalMl),
        percentage: Math.min(
          100,
          Math.round((log.totalMl / WATER_TARGET_ML) * 100)
        ),
        entries: log.entries.length,
      },
    };
  }
);

/** ─── log_sleep ──────────────────────────────────────────────────── */

const logSleep = createTool(
  {
    name: 'log_sleep',
    description: 'Manually log sleep (fallback when Whoop is not available).',
    category: 'health',
    tags: ['sleep', 'rest'],
    parameters: {
      type: 'object',
      properties: {
        hours_slept: { type: 'number', description: 'Hours slept' },
        quality: {
          type: 'string',
          enum: ['poor', 'fair', 'good', 'great'],
          description: 'Subjective sleep quality',
        },
        date: { type: 'string', description: 'Date (default: today)' },
        notes: { type: 'string', description: 'Optional notes' },
      },
      required: ['hours_slept'],
    },
  },
  async (params) => {
    const entry: SleepLog = {
      date: (params.date as string) || todayStr(),
      hoursSlept: params.hours_slept as number,
      quality: (params.quality as string) || 'not rated',
      notes: params.notes as string | undefined,
    };
    sleepLogs.unshift(entry);
    return { success: true, data: entry };
  }
);

/** ─── get_sleep_summary ─────────────────────────────────────────── */

const getSleepSummary = createTool(
  {
    name: 'get_sleep_summary',
    description: '7-day sleep quality summary from manual logs.',
    category: 'health',
    tags: ['sleep', 'summary'],
    parameters: { type: 'object', properties: {} },
  },
  async () => {
    const recent = sleepLogs.slice(0, 7);
    if (recent.length === 0) {
      return {
        success: true,
        data: {
          message: 'No sleep logs yet. Use log_sleep to start tracking.',
        },
      };
    }
    const avg = recent.reduce((s, e) => s + e.hoursSlept, 0) / recent.length;
    return {
      success: true,
      data: {
        nights: recent.length,
        averageHours: avg.toFixed(1),
        entries: recent,
      },
    };
  }
);

/** ─── log_exercise ──────────────────────────────────────────────── */

const logExercise = createTool(
  {
    name: 'log_exercise',
    description: 'Manually log an exercise session.',
    category: 'health',
    tags: ['exercise', 'workout'],
    parameters: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          description:
            'Exercise type (e.g. "running", "cycling", "weightlifting")',
        },
        duration_minutes: {
          type: 'number',
          description: 'Duration in minutes',
        },
        date: { type: 'string', description: 'Date (default: today)' },
        notes: { type: 'string', description: 'Optional notes' },
      },
      required: ['type', 'duration_minutes'],
    },
  },
  async (params) => {
    const entry: ExerciseLog = {
      date: (params.date as string) || todayStr(),
      type: params.type as string,
      durationMinutes: params.duration_minutes as number,
      notes: params.notes as string | undefined,
    };
    exerciseLogs.unshift(entry);
    return { success: true, data: entry };
  }
);

/** ─── calculate_bmi ─────────────────────────────────────────────── */

const calculateBmi = createTool(
  {
    name: 'calculate_bmi',
    description: 'Calculate BMI and provide healthy range context.',
    category: 'health',
    tags: ['bmi', 'health'],
    parameters: {
      type: 'object',
      properties: {
        weight_kg: { type: 'number', description: 'Weight in kilograms' },
        height_cm: { type: 'number', description: 'Height in centimetres' },
      },
      required: ['weight_kg', 'height_cm'],
    },
  },
  async (params) => {
    const w = params.weight_kg as number;
    const h = (params.height_cm as number) / 100;
    const bmi = w / (h * h);

    const category =
      bmi < 18.5
        ? 'Underweight'
        : bmi < 25
        ? 'Normal weight'
        : bmi < 30
        ? 'Overweight'
        : 'Obese';

    const healthyMin = (18.5 * h * h).toFixed(1);
    const healthyMax = (24.9 * h * h).toFixed(1);

    return {
      success: true,
      data: {
        bmi: bmi.toFixed(1),
        category,
        healthyRange: `${healthyMin}–${healthyMax} kg for your height`,
        note: 'BMI is a general screening tool, not a diagnostic measure.',
      },
    };
  }
);

/** ─── send_wellness_nudge ───────────────────────────────────────── */

const sendWellnessNudge = createTool(
  {
    name: 'send_wellness_nudge',
    description:
      'Send a wellness push notification via ntfy (requires NTFY_URL env var).',
    category: 'health',
    tags: ['nudge', 'notification', 'wellness'],
    parameters: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['water', 'stretch', 'move', 'breathe', 'custom'],
          description: 'Nudge type',
        },
        custom_message: {
          type: 'string',
          description: 'Custom message (used when type is "custom")',
        },
      },
      required: ['type'],
    },
  },
  async (params) => {
    if (!NTFY_URL) {
      return {
        success: false,
        error: 'NTFY_URL not configured. Set it to enable push notifications.',
      };
    }

    const messages: Record<
      string,
      { title: string; body: string; tags: string }
    > = {
      water: {
        title: 'Hydration Reminder 💧',
        body: 'Time to drink some water!',
        tags: 'droplet',
      },
      stretch: {
        title: 'Stretch Break 🧘',
        body: 'Take 2 minutes to stretch.',
        tags: 'person_doing_cartwheel',
      },
      move: {
        title: 'Time to Move! 🚶',
        body: "You've been sitting too long. Take a short walk.",
        tags: 'walking',
      },
      breathe: {
        title: 'Breathe 🌬️',
        body: 'Try a 4-7-8 breathing cycle to calm your nervous system.',
        tags: 'wind_face',
      },
      custom: {
        title: 'Wellness Nudge',
        body: (params.custom_message as string) || 'Take care of yourself!',
        tags: 'heart',
      },
    };

    const nudge = messages[params.type as string] || messages['custom'];

    try {
      await fetch(`${NTFY_URL}/${NTFY_TOPIC}`, {
        method: 'POST',
        headers: {
          Title: nudge.title,
          Tags: nudge.tags,
          Priority: '2',
        },
        body: nudge.body,
        signal: AbortSignal.timeout(5000),
      });
      return { success: true, data: { sent: nudge } };
    } catch (err) {
      return {
        success: false,
        error: `Ntfy push failed: ${err instanceof Error ? err.message : err}`,
      };
    }
  }
);

/** ─── Whoop tools ──────────────────────────────────────────────── */

const whoopGetRecovery = createTool(
  {
    name: 'whoop_get_recovery',
    description:
      'Get latest Whoop recovery score, HRV, resting HR, and SpO2. Requires WHOOP_ACCESS_TOKEN.',
    category: 'health',
    tags: ['whoop', 'recovery', 'hrv'],
    parameters: { type: 'object', properties: {} },
  },
  async () => {
    try {
      // Get latest cycle ID first
      const cycles = await whoopGet('/v2/cycle?limit=1');
      const cycleId = (cycles.records || cycles)[0]?.id;

      const recovery = await whoopGet(
        `/v2/recovery${cycleId ? `?start=${cycleId}` : '?limit=1'}`
      );
      const r = (recovery.records || recovery)[0];
      if (!r) return { success: false, error: 'No recovery data found' };

      return {
        success: true,
        data: {
          date: r.created_at,
          recoveryScore: r.score?.recovery_score,
          hrv: r.score?.hrv_rmssd_milli
            ? `${r.score.hrv_rmssd_milli.toFixed(1)} ms`
            : null,
          restingHeartRate: r.score?.resting_heart_rate
            ? `${r.score.resting_heart_rate} bpm`
            : null,
          spo2: r.score?.spo2_percentage
            ? `${r.score.spo2_percentage.toFixed(1)}%`
            : null,
          skinTempCelsius: r.score?.skin_temp_celsius,
          userCalibrating: r.score?.user_calibrating,
        },
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
);

const whoopGetSleep = createTool(
  {
    name: 'whoop_get_sleep',
    description:
      'Get latest Whoop sleep data including performance score, stages, and respiratory rate.',
    category: 'health',
    tags: ['whoop', 'sleep'],
    parameters: { type: 'object', properties: {} },
  },
  async () => {
    try {
      const data = await whoopGet('/v2/activity/sleep?limit=1');
      const s = (data.records || data)[0];
      if (!s) return { success: false, error: 'No sleep data found' };

      return {
        success: true,
        data: {
          startTime: s.start,
          endTime: s.end,
          performancePercent: s.score?.sleep_performance_percentage,
          efficiencyPercent: s.score?.sleep_efficiency_percentage,
          consistencyPercent: s.score?.sleep_consistency_percentage,
          respiratoryRate: s.score?.respiratory_rate,
          hoursNeeded: s.score?.sleep_needed?.sleep_debt_ms
            ? (s.score.sleep_needed.sleep_debt_ms / 3_600_000).toFixed(2)
            : null,
          stages: {
            slowWaveMinutes: s.score?.stage_summary
              ?.total_slow_wave_sleep_time_milli
              ? Math.round(
                  s.score.stage_summary.total_slow_wave_sleep_time_milli / 60000
                )
              : null,
            remMinutes: s.score?.stage_summary?.total_rem_sleep_time_milli
              ? Math.round(
                  s.score.stage_summary.total_rem_sleep_time_milli / 60000
                )
              : null,
            lightMinutes: s.score?.stage_summary?.total_light_sleep_time_milli
              ? Math.round(
                  s.score.stage_summary.total_light_sleep_time_milli / 60000
                )
              : null,
            awakeMinutes: s.score?.stage_summary?.total_awake_time_milli
              ? Math.round(s.score.stage_summary.total_awake_time_milli / 60000)
              : null,
          },
        },
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
);

const whoopGetDayStrain = createTool(
  {
    name: 'whoop_get_day_strain',
    description:
      'Get latest Whoop day strain score, total calories burned, and average/max HR.',
    category: 'health',
    tags: ['whoop', 'strain', 'training'],
    parameters: { type: 'object', properties: {} },
  },
  async () => {
    try {
      const data = await whoopGet('/v2/cycle?limit=1');
      const c = (data.records || data)[0];
      if (!c) return { success: false, error: 'No cycle data found' };

      return {
        success: true,
        data: {
          date: c.start,
          strain: c.score?.strain,
          totalCal: c.score?.kilojoule
            ? (c.score.kilojoule / 4.184).toFixed(0) + ' kcal'
            : null,
          avgHeartRate: c.score?.average_heart_rate
            ? `${c.score.average_heart_rate} bpm`
            : null,
          maxHeartRate: c.score?.max_heart_rate
            ? `${c.score.max_heart_rate} bpm`
            : null,
        },
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
);

const whoopGetWorkouts = createTool(
  {
    name: 'whoop_get_workouts',
    description:
      'Get recent Whoop workouts with sport, strain, HR zones, and calories.',
    category: 'health',
    tags: ['whoop', 'workout', 'exercise'],
    parameters: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Number of workouts (default: 5)',
        },
      },
    },
  },
  async (params) => {
    try {
      const n = Math.min((params.limit as number) || 5, 20);
      const data = await whoopGet(`/v2/activity/workout?limit=${n}`);
      const workouts = (data.records || data).map((w: any) => ({
        start: w.start,
        end: w.end,
        sport: w.sport_id,
        strain: w.score?.strain,
        calories: w.score?.kilojoule
          ? (w.score.kilojoule / 4.184).toFixed(0)
          : null,
        avgHr: w.score?.average_heart_rate,
        maxHr: w.score?.max_heart_rate,
        distance: w.score?.distance_meter
          ? `${(w.score.distance_meter / 1000).toFixed(2)} km`
          : null,
      }));

      return { success: true, data: { count: workouts.length, workouts } };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
);

const whoopGetReadinessBrief = createTool(
  {
    name: 'whoop_get_readiness_brief',
    description:
      'Get a synthesized readiness narrative from Whoop recovery + sleep + strain data. One paragraph, plain language.',
    category: 'health',
    tags: ['whoop', 'readiness', 'summary'],
    parameters: { type: 'object', properties: {} },
  },
  async () => {
    try {
      const [recoveryData, sleepData, cycleData] = await Promise.all([
        whoopGet('/v2/recovery?limit=1').catch(() => null),
        whoopGet('/v2/activity/sleep?limit=1').catch(() => null),
        whoopGet('/v2/cycle?limit=1').catch(() => null),
      ]);

      const r = recoveryData ? (recoveryData.records || recoveryData)[0] : null;
      const s = sleepData ? (sleepData.records || sleepData)[0] : null;
      const c = cycleData ? (cycleData.records || cycleData)[0] : null;

      const recovery = r?.score?.recovery_score;
      const hrv = r?.score?.hrv_rmssd_milli?.toFixed(1);
      const rhr = r?.score?.resting_heart_rate;
      const sleepPerf = s?.score?.sleep_performance_percentage;
      const yesterdayStrain = c?.score?.strain;

      const recoveryTier =
        recovery == null
          ? 'unknown'
          : recovery >= 67
          ? 'green'
          : recovery >= 34
          ? 'yellow'
          : 'red';

      const recommendation: Record<string, string> = {
        green: 'Your body is well-recovered — push hard today.',
        yellow: 'Moderate intensity is appropriate — avoid PRs.',
        red: 'Prioritise rest or very light movement today.',
        unknown: 'No recovery data available to assess readiness.',
      };

      const brief =
        `Recovery: ${
          recovery != null ? `${recovery}%` : 'N/A'
        } (${recoveryTier}). ` +
        `HRV: ${hrv ? `${hrv} ms` : 'N/A'}. ` +
        `Resting HR: ${rhr ? `${rhr} bpm` : 'N/A'}. ` +
        `Sleep performance: ${sleepPerf ? `${sleepPerf}%` : 'N/A'}. ` +
        `Yesterday's strain: ${yesterdayStrain ?? 'N/A'}. ` +
        recommendation[recoveryTier];

      return {
        success: true,
        data: {
          readinessBrief: brief,
          recoveryScore: recovery,
          hrv,
          restingHeartRate: rhr,
          sleepPerformance: sleepPerf,
          yesterdayStrain,
          recommendation: recommendation[recoveryTier],
        },
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
);

// Register all health tools
const registry = getToolRegistry();
registry.register(lookupNutrition);
registry.register(logWater);
registry.register(getWaterStatus);
registry.register(logSleep);
registry.register(getSleepSummary);
registry.register(logExercise);
registry.register(calculateBmi);
registry.register(sendWellnessNudge);
registry.register(whoopGetRecovery);
registry.register(whoopGetSleep);
registry.register(whoopGetDayStrain);
registry.register(whoopGetWorkouts);
registry.register(whoopGetReadinessBrief);

export {
  lookupNutrition,
  logWater,
  getWaterStatus,
  logSleep,
  getSleepSummary,
  logExercise,
  calculateBmi,
  sendWellnessNudge,
  whoopGetRecovery,
  whoopGetSleep,
  whoopGetDayStrain,
  whoopGetWorkouts,
  whoopGetReadinessBrief,
};
