import { createTool, getToolRegistry } from '../tool-registry';

/** ─── convert_units ──────────────────────────────────────────────── */

interface ConversionTable {
  [key: string]: { [key: string]: number };
}

const CONVERSIONS: Record<string, ConversionTable> = {
  length: {
    m: {
      m: 1,
      km: 0.001,
      cm: 100,
      mm: 1000,
      inch: 39.3701,
      ft: 3.28084,
      yd: 1.09361,
      mi: 0.000621371,
    },
    km: {
      m: 1000,
      km: 1,
      cm: 100000,
      mm: 1e6,
      inch: 39370.1,
      ft: 3280.84,
      yd: 1093.61,
      mi: 0.621371,
    },
    cm: {
      m: 0.01,
      km: 0.00001,
      cm: 1,
      mm: 10,
      inch: 0.393701,
      ft: 0.0328084,
      yd: 0.0109361,
      mi: 6.21371e-6,
    },
    inch: {
      m: 0.0254,
      km: 0.0000254,
      cm: 2.54,
      mm: 25.4,
      inch: 1,
      ft: 0.0833333,
      yd: 0.0277778,
      mi: 0.0000157828,
    },
    ft: {
      m: 0.3048,
      km: 0.0003048,
      cm: 30.48,
      mm: 304.8,
      inch: 12,
      ft: 1,
      yd: 0.333333,
      mi: 0.000189394,
    },
    mi: {
      m: 1609.34,
      km: 1.60934,
      cm: 160934,
      mm: 1.60934e6,
      inch: 63360,
      ft: 5280,
      yd: 1760,
      mi: 1,
    },
  },
  weight: {
    kg: { kg: 1, g: 1000, mg: 1e6, lb: 2.20462, oz: 35.274, tonne: 0.001 },
    g: { kg: 0.001, g: 1, mg: 1000, lb: 0.00220462, oz: 0.035274, tonne: 1e-6 },
    lb: {
      kg: 0.453592,
      g: 453.592,
      mg: 453592,
      lb: 1,
      oz: 16,
      tonne: 0.000453592,
    },
    oz: {
      kg: 0.0283495,
      g: 28.3495,
      mg: 28349.5,
      lb: 0.0625,
      oz: 1,
      tonne: 2.835e-5,
    },
  },
  volume: {
    l: {
      l: 1,
      ml: 1000,
      cl: 100,
      m3: 0.001,
      gallon: 0.264172,
      qt: 1.05669,
      pt: 2.11338,
      cup: 4.22675,
      floz: 33.814,
      tsp: 202.884,
      tbsp: 67.628,
    },
    ml: {
      l: 0.001,
      ml: 1,
      cl: 0.1,
      gallon: 0.000264172,
      qt: 0.00105669,
      cup: 0.00422675,
      floz: 0.033814,
      tsp: 0.202884,
      tbsp: 0.067628,
    },
    gallon: {
      l: 3.78541,
      ml: 3785.41,
      gallon: 1,
      qt: 4,
      pt: 8,
      cup: 16,
      floz: 128,
      tsp: 768,
      tbsp: 256,
    },
    cup: {
      l: 0.236588,
      ml: 236.588,
      gallon: 0.0625,
      cup: 1,
      floz: 8,
      tsp: 48,
      tbsp: 16,
    },
    tsp: { l: 0.00492892, ml: 4.92892, cup: 0.0208333, tsp: 1, tbsp: 0.333333 },
    tbsp: { l: 0.0147868, ml: 14.7868, cup: 0.0625, tsp: 3, tbsp: 1 },
  },
  speed: {
    'km/h': {
      'km/h': 1,
      'm/s': 0.277778,
      mph: 0.621371,
      knot: 0.539957,
      'ft/s': 0.911344,
    },
    'm/s': {
      'km/h': 3.6,
      'm/s': 1,
      mph: 2.23694,
      knot: 1.94384,
      'ft/s': 3.28084,
    },
    mph: {
      'km/h': 1.60934,
      'm/s': 0.44704,
      mph: 1,
      knot: 0.868976,
      'ft/s': 1.46667,
    },
  },
  data: {
    bit: {
      bit: 1,
      byte: 0.125,
      kb: 0.000125,
      mb: 1.25e-7,
      gb: 1.25e-10,
      tb: 1.25e-13,
    },
    byte: { bit: 8, byte: 1, kb: 0.001, mb: 1e-6, gb: 1e-9, tb: 1e-12 },
    kb: { bit: 8000, byte: 1000, kb: 1, mb: 0.001, gb: 1e-6, tb: 1e-9 },
    mb: { bit: 8e6, byte: 1e6, kb: 1000, mb: 1, gb: 0.001, tb: 1e-6 },
    gb: { bit: 8e9, byte: 1e9, kb: 1e6, mb: 1000, gb: 1, tb: 0.001 },
    tb: { bit: 8e12, byte: 1e12, kb: 1e9, mb: 1e6, gb: 1000, tb: 1 },
  },
  area: {
    m2: {
      m2: 1,
      km2: 1e-6,
      cm2: 10000,
      ft2: 10.7639,
      in2: 1550,
      acre: 0.000247105,
      ha: 0.0001,
    },
    ft2: {
      m2: 0.0929,
      km2: 9.29e-8,
      ft2: 1,
      in2: 144,
      acre: 0.0000229568,
      ha: 9.29e-6,
    },
    acre: { m2: 4046.86, km2: 0.00404686, ft2: 43560, acre: 1, ha: 0.404686 },
    ha: { m2: 10000, km2: 0.01, ft2: 107639, acre: 2.47105, ha: 1 },
  },
  energy: {
    j: {
      j: 1,
      kj: 0.001,
      cal: 0.239006,
      kcal: 0.000239006,
      wh: 0.000277778,
      kwh: 2.77778e-7,
      btu: 0.000947817,
    },
    kcal: {
      j: 4184,
      kj: 4.184,
      cal: 1000,
      kcal: 1,
      wh: 1.16222,
      kwh: 0.00116222,
      btu: 3.96567,
    },
    kwh: {
      j: 3.6e6,
      kj: 3600,
      cal: 860421,
      kcal: 860.421,
      wh: 1000,
      kwh: 1,
      btu: 3412.14,
    },
  },
};

const convertUnits = createTool(
  {
    name: 'convert_units',
    description:
      'Convert between units of length, weight, volume, speed, area, energy, and data. Also handles temperature.',
    category: 'math',
    tags: ['units', 'converter', 'measurement'],
    parameters: {
      type: 'object',
      properties: {
        value: { type: 'number', description: 'Value to convert' },
        from: {
          type: 'string',
          description: 'Source unit (e.g. "km", "kg", "°C", "gallon")',
        },
        to: {
          type: 'string',
          description: 'Target unit (e.g. "mi", "lb", "°F", "liter")',
        },
      },
      required: ['value', 'from', 'to'],
    },
  },
  async (params) => {
    const value = params.value as number;
    const from = (params.from as string)
      .toLowerCase()
      .replace(/°/g, '')
      .replace(/\s/g, '')
      .replace('celsius', 'c')
      .replace('fahrenheit', 'f')
      .replace('kelvin', 'k');
    const to = (params.to as string)
      .toLowerCase()
      .replace(/°/g, '')
      .replace(/\s/g, '')
      .replace('celsius', 'c')
      .replace('fahrenheit', 'f')
      .replace('kelvin', 'k');

    // Temperature special case
    const tempFrom = from === 'c' || from === 'f' || from === 'k';
    const tempTo = to === 'c' || to === 'f' || to === 'k';

    if (tempFrom || tempTo) {
      let celsius: number;
      if (from === 'c') celsius = value;
      else if (from === 'f') celsius = ((value - 32) * 5) / 9;
      else if (from === 'k') celsius = value - 273.15;
      else
        return { success: false, error: `Unknown temperature unit: ${from}` };

      let result: number;
      if (to === 'c') result = celsius;
      else if (to === 'f') result = (celsius * 9) / 5 + 32;
      else if (to === 'k') result = celsius + 273.15;
      else return { success: false, error: `Unknown temperature unit: ${to}` };

      return {
        success: true,
        data: {
          value,
          from: params.from,
          to: params.to,
          result: parseFloat(result.toFixed(4)),
          formula: `${value}${params.from} = ${result.toFixed(2)}${params.to}`,
        },
      };
    }

    // Find category
    for (const [category, table] of Object.entries(CONVERSIONS)) {
      const fromRow = table[from];
      if (fromRow?.[to] != null) {
        const result = value * fromRow[to];
        return {
          success: true,
          data: {
            value,
            from: params.from,
            to: params.to,
            result: parseFloat(result.toPrecision(8)),
            category,
          },
        };
      }
    }

    return {
      success: false,
      error: `Cannot convert "${params.from}" to "${
        params.to
      }". Supported categories: ${Object.keys(CONVERSIONS).join(
        ', '
      )}, temperature (C/F/K).`,
    };
  }
);

/** ─── calculate_percentage ───────────────────────────────────────── */

const calculatePercentage = createTool(
  {
    name: 'calculate_percentage',
    description:
      'Percentage calculations: X% of Y, percentage change between values, or "X is what % of Y".',
    category: 'math',
    tags: ['percentage', 'math'],
    parameters: {
      type: 'object',
      properties: {
        mode: {
          type: 'string',
          enum: ['percent_of', 'percent_change', 'what_percent'],
          description:
            '"percent_of" = X% of Y | "percent_change" = % change from A to B | "what_percent" = X is what % of Y',
        },
        a: {
          type: 'number',
          description: 'First value (percentage, original, or part)',
        },
        b: {
          type: 'number',
          description: 'Second value (base, new value, or whole)',
        },
      },
      required: ['mode', 'a', 'b'],
    },
  },
  async (params) => {
    const a = params.a as number;
    const b = params.b as number;

    switch (params.mode) {
      case 'percent_of':
        return {
          success: true,
          data: { description: `${a}% of ${b}`, result: (a / 100) * b },
        };
      case 'percent_change':
        if (a === 0)
          return { success: false, error: 'Original value cannot be zero' };
        return {
          success: true,
          data: {
            description: `% change from ${a} to ${b}`,
            result: parseFloat((((b - a) / a) * 100).toFixed(4)),
            direction: b > a ? 'increase' : 'decrease',
          },
        };
      case 'what_percent':
        if (b === 0) return { success: false, error: 'Whole cannot be zero' };
        return {
          success: true,
          data: {
            description: `${a} is what % of ${b}`,
            result: parseFloat(((a / b) * 100).toFixed(4)),
          },
        };
      default:
        return { success: false, error: 'Unknown mode' };
    }
  }
);

/** ─── solve_equation ─────────────────────────────────────────────── */

const solveEquation = createTool(
  {
    name: 'solve_equation',
    description:
      'Solve linear (ax + b = c) or quadratic (ax² + bx + c = 0) equations. Returns exact and decimal solutions.',
    category: 'math',
    tags: ['equation', 'algebra', 'math'],
    parameters: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['linear', 'quadratic'],
          description: 'Equation type',
        },
        a: { type: 'number', description: 'Coefficient a' },
        b: {
          type: 'number',
          description: 'Coefficient b (or constant for linear y = ax + b)',
        },
        c: { type: 'number', description: 'Constant c (quadratic only)' },
      },
      required: ['type', 'a', 'b'],
    },
  },
  async (params) => {
    const type = params.type as string;
    const a = params.a as number;
    const b = params.b as number;

    if (type === 'linear') {
      // ax + b = 0  →  x = -b/a
      if (a === 0) {
        if (b === 0)
          return {
            success: true,
            data: { solution: 'infinite solutions (0 = 0)' },
          };
        return {
          success: true,
          data: { solution: 'no solution (0 = constant)' },
        };
      }
      const x = -b / a;
      return {
        success: true,
        data: {
          equation: `${a}x + ${b} = 0`,
          solution: x,
          description: `x = ${x}`,
        },
      };
    }

    if (type === 'quadratic') {
      const c = (params.c as number) ?? 0;
      // ax² + bx + c = 0
      if (a === 0)
        return {
          success: false,
          error: 'Coefficient a cannot be zero for quadratic',
        };
      const discriminant = b * b - 4 * a * c;
      if (discriminant < 0) {
        const realPart = -b / (2 * a);
        const imagPart = Math.sqrt(-discriminant) / (2 * a);
        return {
          success: true,
          data: {
            equation: `${a}x² + ${b}x + ${c} = 0`,
            discriminant,
            solutions: [
              `${realPart.toFixed(4)} + ${imagPart.toFixed(4)}i`,
              `${realPart.toFixed(4)} - ${imagPart.toFixed(4)}i`,
            ],
            type: 'complex',
          },
        };
      }
      const x1 = (-b + Math.sqrt(discriminant)) / (2 * a);
      const x2 = (-b - Math.sqrt(discriminant)) / (2 * a);
      return {
        success: true,
        data: {
          equation: `${a}x² + ${b}x + ${c} = 0`,
          discriminant,
          solutions: discriminant === 0 ? [x1] : [x1, x2],
          type: discriminant === 0 ? 'one real solution' : 'two real solutions',
        },
      };
    }

    return { success: false, error: 'Unsupported equation type' };
  }
);

/** ─── statistics_summary ─────────────────────────────────────────── */

const statisticsSummary = createTool(
  {
    name: 'statistics_summary',
    description:
      'Compute descriptive statistics for a list of numbers: mean, median, mode, std dev, min/max.',
    category: 'math',
    tags: ['statistics', 'math', 'data'],
    parameters: {
      type: 'object',
      properties: {
        values: {
          type: 'array',
          description: 'Array of numeric values',
          items: { type: 'number', description: 'Numeric value' },
        },
      },
      required: ['values'],
    },
  },
  async (params) => {
    const values = (params.values as number[]).filter(
      (v) => typeof v === 'number' && isFinite(v)
    );
    if (values.length === 0)
      return { success: false, error: 'No valid numeric values provided' };

    const n = values.length;
    const sorted = [...values].sort((a, b) => a - b);
    const mean = values.reduce((s, v) => s + v, 0) / n;
    const median =
      n % 2 === 0
        ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2
        : sorted[Math.floor(n / 2)];

    // Mode
    const freq: Map<number, number> = new Map();
    for (const v of values) freq.set(v, (freq.get(v) || 0) + 1);
    const maxFreq = Math.max(...freq.values());
    const mode = [...freq.entries()]
      .filter(([, f]) => f === maxFreq)
      .map(([v]) => v);

    // Variance and std dev
    const variance = values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / n;
    const stdDev = Math.sqrt(variance);

    // Quartiles
    const q1 = sorted[Math.floor(n / 4)];
    const q3 = sorted[Math.floor((3 * n) / 4)];

    return {
      success: true,
      data: {
        count: n,
        sum: values.reduce((s, v) => s + v, 0),
        mean: parseFloat(mean.toFixed(6)),
        median,
        mode: mode.length === n ? 'no mode' : mode,
        min: sorted[0],
        max: sorted[n - 1],
        range: sorted[n - 1] - sorted[0],
        q1,
        q3,
        iqr: q3 - q1,
        variance: parseFloat(variance.toFixed(6)),
        stdDev: parseFloat(stdDev.toFixed(6)),
        coefficientOfVariation:
          mean !== 0 ? `${((stdDev / mean) * 100).toFixed(2)}%` : 'N/A',
      },
    };
  }
);

// Register all math tools
const registry = getToolRegistry();
registry.register(convertUnits);
registry.register(calculatePercentage);
registry.register(solveEquation);
registry.register(statisticsSummary);

export { convertUnits, calculatePercentage, solveEquation, statisticsSummary };
