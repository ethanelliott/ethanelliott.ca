import { createTool, getToolRegistry } from '../tool-registry';

/** ─── env config ───────────────────────────────────────────────── */

const WHOOP_TOKEN = process.env['WHOOP_ACCESS_TOKEN'];
const WHOOP_BASE = 'https://api.prod.whoop.com/developer';

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
registry.register(calculateBmi);
registry.register(whoopGetRecovery);
registry.register(whoopGetSleep);
registry.register(whoopGetDayStrain);
registry.register(whoopGetWorkouts);
registry.register(whoopGetReadinessBrief);

export {
  lookupNutrition,
  calculateBmi,
  whoopGetRecovery,
  whoopGetSleep,
  whoopGetDayStrain,
  whoopGetWorkouts,
  whoopGetReadinessBrief,
};
