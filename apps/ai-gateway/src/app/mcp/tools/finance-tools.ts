import { createTool, getToolRegistry } from '../tool-registry';

const FINANCES_API_URL =
  process.env['FINANCES_API_URL'] || 'http://finances.default.svc:3000';

/** ─── helpers ──────────────────────────────────────────────────── */

async function financesGet(path: string) {
  const resp = await fetch(`${FINANCES_API_URL}${path}`, {
    signal: AbortSignal.timeout(10000),
  });
  if (!resp.ok)
    throw new Error(`Finances API ${resp.status}: ${resp.statusText}`);
  return resp.json();
}

async function financesPost(path: string, body: unknown) {
  const resp = await fetch(`${FINANCES_API_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => resp.statusText);
    throw new Error(`Finances API ${resp.status}: ${text}`);
  }
  return resp.json();
}

/** ─── get_exchange_rate ─────────────────────────────────────────── */

const getExchangeRate = createTool(
  {
    name: 'get_exchange_rate',
    description:
      'Get live foreign exchange rate between any two currencies (Frankfurter API — free, no key).',
    category: 'finance',
    tags: ['currency', 'forex', 'rate'],
    parameters: {
      type: 'object',
      properties: {
        from: {
          type: 'string',
          description: 'Source currency code (e.g. "USD", "CAD")',
        },
        to: {
          type: 'string',
          description: 'Target currency code (e.g. "EUR", "GBP")',
        },
      },
      required: ['from', 'to'],
    },
  },
  async (params) => {
    const from = (params.from as string).toUpperCase();
    const to = (params.to as string).toUpperCase();

    try {
      const url = `https://api.frankfurter.app/latest?from=${from}&to=${to}`;
      const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!resp.ok)
        return {
          success: false,
          error: `Frankfurter API error: ${resp.status}`,
        };
      const data = (await resp.json()) as any;
      const rate = data.rates?.[to];
      if (!rate)
        return { success: false, error: `Rate not found for ${from}→${to}` };

      return {
        success: true,
        data: {
          from,
          to,
          rate,
          date: data.date,
          description: `1 ${from} = ${rate} ${to}`,
        },
      };
    } catch (err) {
      return {
        success: false,
        error: `Exchange rate fetch failed: ${
          err instanceof Error ? err.message : err
        }`,
      };
    }
  }
);

/** ─── convert_currency ──────────────────────────────────────────── */

const convertCurrency = createTool(
  {
    name: 'convert_currency',
    description: 'Convert an amount between two currencies using live rates.',
    category: 'finance',
    tags: ['currency', 'converter'],
    parameters: {
      type: 'object',
      properties: {
        amount: { type: 'number', description: 'Amount to convert' },
        from: { type: 'string', description: 'Source currency code' },
        to: { type: 'string', description: 'Target currency code' },
      },
      required: ['amount', 'from', 'to'],
    },
  },
  async (params) => {
    const amount = params.amount as number;
    const from = (params.from as string).toUpperCase();
    const to = (params.to as string).toUpperCase();

    try {
      const url = `https://api.frankfurter.app/latest?amount=${amount}&from=${from}&to=${to}`;
      const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!resp.ok)
        return {
          success: false,
          error: `Frankfurter API error: ${resp.status}`,
        };
      const data = (await resp.json()) as any;
      const converted = data.rates?.[to];

      return {
        success: true,
        data: {
          original: `${amount} ${from}`,
          converted: `${converted} ${to}`,
          rate: converted / amount,
          date: data.date,
        },
      };
    } catch (err) {
      return {
        success: false,
        error: `Currency conversion failed: ${
          err instanceof Error ? err.message : err
        }`,
      };
    }
  }
);

/** ─── get_crypto_price ──────────────────────────────────────────── */

const getCryptoPrice = createTool(
  {
    name: 'get_crypto_price',
    description:
      'Get current cryptocurrency price, 24h change, and market cap (CoinGecko free tier).',
    category: 'finance',
    tags: ['crypto', 'bitcoin', 'price'],
    parameters: {
      type: 'object',
      properties: {
        coin: {
          type: 'string',
          description:
            'Coin ID (e.g. "bitcoin", "ethereum", "solana") or ticker (e.g. "BTC")',
        },
        currency: {
          type: 'string',
          description: 'Currency to display in (default: "usd")',
        },
      },
      required: ['coin'],
    },
  },
  async (params) => {
    const currency = ((params.currency as string) || 'usd').toLowerCase();
    const rawCoin = (params.coin as string).toLowerCase();

    // Map common tickers to CoinGecko IDs
    const tickerMap: Record<string, string> = {
      btc: 'bitcoin',
      eth: 'ethereum',
      sol: 'solana',
      bnb: 'binancecoin',
      xrp: 'ripple',
      ada: 'cardano',
      doge: 'dogecoin',
      dot: 'polkadot',
      matic: 'matic-network',
      link: 'chainlink',
    };
    const coinId = tickerMap[rawCoin] || rawCoin;

    try {
      const url =
        `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}` +
        `&vs_currencies=${currency}&include_24hr_change=true&include_market_cap=true&include_24hr_vol=true`;
      const resp = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(10000),
      });
      if (!resp.ok)
        return { success: false, error: `CoinGecko API error: ${resp.status}` };
      const data = (await resp.json()) as any;
      const coinData = data[coinId];
      if (!coinData)
        return {
          success: false,
          error: `Coin "${coinId}" not found on CoinGecko`,
        };

      return {
        success: true,
        data: {
          coin: coinId,
          currency: currency.toUpperCase(),
          price: coinData[currency],
          change24h: `${coinData[`${currency}_24h_change`]?.toFixed(2)}%`,
          marketCap: coinData[`${currency}_market_cap`],
          volume24h: coinData[`${currency}_24h_vol`],
        },
      };
    } catch (err) {
      return {
        success: false,
        error: `Crypto price fetch failed: ${
          err instanceof Error ? err.message : err
        }`,
      };
    }
  }
);

/** ─── track_expense ──────────────────────────────────────────────── */

const trackExpense = createTool(
  {
    name: 'track_expense',
    description: 'Log a transaction/expense to the finances app.',
    category: 'finance',
    tags: ['expense', 'budget', 'spending'],
    parameters: {
      type: 'object',
      properties: {
        amount: {
          type: 'number',
          description: 'Amount (positive = expense, negative = income)',
        },
        description: {
          type: 'string',
          description: 'Description of the transaction',
        },
        category: {
          type: 'string',
          description: 'Category (e.g. "food", "transport", "entertainment")',
        },
        date: {
          type: 'string',
          description: 'Transaction date (ISO 8601, default: today)',
        },
      },
      required: ['amount', 'description'],
    },
  },
  async (params) => {
    try {
      const body = {
        amount: params.amount,
        description: params.description,
        category: (params.category as string) || 'uncategorized',
        date: (params.date as string) || new Date().toISOString().split('T')[0],
      };
      const result = await financesPost('/transactions', body);
      return { success: true, data: result };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
);

/** ─── get_spending_summary ──────────────────────────────────────── */

const getSpendingSummary = createTool(
  {
    name: 'get_spending_summary',
    description:
      'Get monthly or weekly spending breakdown by category from the finances app.',
    category: 'finance',
    tags: ['budget', 'spending', 'summary'],
    parameters: {
      type: 'object',
      properties: {
        period: {
          type: 'string',
          enum: ['week', 'month', 'year'],
          description: 'Time period (default: month)',
        },
      },
    },
  },
  async (params) => {
    try {
      const period = (params.period as string) || 'month';
      const data = await financesGet(`/summary?period=${period}`);
      return { success: true, data };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
);

/** ─── calculate_tip ──────────────────────────────────────────────── */

const calculateTip = createTool(
  {
    name: 'calculate_tip',
    description:
      'Calculate tip amount and total, with optional bill splitting.',
    category: 'finance',
    tags: ['tip', 'calculator'],
    parameters: {
      type: 'object',
      properties: {
        bill_amount: { type: 'number', description: 'Pre-tip bill total' },
        tip_percentage: {
          type: 'number',
          description: 'Tip percentage (e.g. 18 for 18%)',
        },
        num_people: {
          type: 'number',
          description: 'Number of people to split between (default: 1)',
        },
        currency_symbol: {
          type: 'string',
          description: 'Currency symbol (default: "$")',
        },
      },
      required: ['bill_amount', 'tip_percentage'],
    },
  },
  async (params) => {
    const bill = params.bill_amount as number;
    const tipPct = params.tip_percentage as number;
    const people = (params.num_people as number) || 1;
    const sym = (params.currency_symbol as string) || '$';

    const tipAmount = bill * (tipPct / 100);
    const total = bill + tipAmount;
    const perPerson = total / people;

    return {
      success: true,
      data: {
        billAmount: `${sym}${bill.toFixed(2)}`,
        tipPercentage: `${tipPct}%`,
        tipAmount: `${sym}${tipAmount.toFixed(2)}`,
        total: `${sym}${total.toFixed(2)}`,
        perPerson:
          people > 1
            ? `${sym}${perPerson.toFixed(2)} (${people} people)`
            : undefined,
      },
    };
  }
);

/** ─── calculate_loan ─────────────────────────────────────────────── */

const calculateLoan = createTool(
  {
    name: 'calculate_loan',
    description: 'Calculate monthly payment and total interest for a loan.',
    category: 'finance',
    tags: ['loan', 'mortgage', 'calculator'],
    parameters: {
      type: 'object',
      properties: {
        principal: { type: 'number', description: 'Loan principal amount' },
        annual_rate: {
          type: 'number',
          description: 'Annual interest rate as percentage (e.g. 5.5 for 5.5%)',
        },
        term_months: { type: 'number', description: 'Loan term in months' },
        currency_symbol: {
          type: 'string',
          description: 'Currency symbol (default: "$")',
        },
      },
      required: ['principal', 'annual_rate', 'term_months'],
    },
  },
  async (params) => {
    const P = params.principal as number;
    const r = (params.annual_rate as number) / 100 / 12;
    const n = params.term_months as number;
    const sym = (params.currency_symbol as string) || '$';

    let monthly: number;
    if (r === 0) {
      monthly = P / n;
    } else {
      monthly = (P * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
    }

    const totalPaid = monthly * n;
    const totalInterest = totalPaid - P;

    return {
      success: true,
      data: {
        principal: `${sym}${P.toFixed(2)}`,
        annualRate: `${params.annual_rate}%`,
        termMonths: n,
        monthlyPayment: `${sym}${monthly.toFixed(2)}`,
        totalPaid: `${sym}${totalPaid.toFixed(2)}`,
        totalInterest: `${sym}${totalInterest.toFixed(2)}`,
        interestRatio: `${((totalInterest / P) * 100).toFixed(
          1
        )}% of principal`,
      },
    };
  }
);

/** ─── calculate_compound_interest ──────────────────────────────── */

const calculateCompoundInterest = createTool(
  {
    name: 'calculate_compound_interest',
    description: 'Project savings growth with compound interest.',
    category: 'finance',
    tags: ['savings', 'compound', 'calculator'],
    parameters: {
      type: 'object',
      properties: {
        principal: { type: 'number', description: 'Initial deposit' },
        annual_rate: {
          type: 'number',
          description: 'Annual interest rate as percentage',
        },
        years: { type: 'number', description: 'Number of years' },
        compounds_per_year: {
          type: 'number',
          description:
            'Compounding frequency: 1=annually, 12=monthly, 365=daily (default: 12)',
        },
        monthly_contribution: {
          type: 'number',
          description: 'Optional recurring monthly contribution',
        },
        currency_symbol: {
          type: 'string',
          description: 'Currency symbol (default: "$")',
        },
      },
      required: ['principal', 'annual_rate', 'years'],
    },
  },
  async (params) => {
    const P = params.principal as number;
    const r = (params.annual_rate as number) / 100;
    const t = params.years as number;
    const n = (params.compounds_per_year as number) || 12;
    const pmt = (params.monthly_contribution as number) || 0;
    const sym = (params.currency_symbol as string) || '$';

    // FV of principal
    const fvPrincipal = P * Math.pow(1 + r / n, n * t);

    // FV of monthly contributions (if any)
    const rPeriod = r / 12;
    const periods = t * 12;
    let fvContributions = 0;
    if (pmt > 0 && rPeriod > 0) {
      fvContributions = pmt * ((Math.pow(1 + rPeriod, periods) - 1) / rPeriod);
    } else if (pmt > 0) {
      fvContributions = pmt * periods;
    }

    const totalValue = fvPrincipal + fvContributions;
    const totalContributed = P + pmt * periods;
    const totalInterestEarned = totalValue - totalContributed;

    return {
      success: true,
      data: {
        initialDeposit: `${sym}${P.toFixed(2)}`,
        monthlyContribution: pmt > 0 ? `${sym}${pmt.toFixed(2)}` : 'None',
        annualRate: `${params.annual_rate}%`,
        years: t,
        finalValue: `${sym}${totalValue.toFixed(2)}`,
        totalContributed: `${sym}${totalContributed.toFixed(2)}`,
        interestEarned: `${sym}${totalInterestEarned.toFixed(2)}`,
        growthMultiple: `${(totalValue / totalContributed).toFixed(2)}x`,
      },
    };
  }
);

// Register all finance tools
const registry = getToolRegistry();
registry.register(getExchangeRate);
registry.register(convertCurrency);
registry.register(getCryptoPrice);
registry.register(trackExpense);
registry.register(getSpendingSummary);
registry.register(calculateTip);
registry.register(calculateLoan);
registry.register(calculateCompoundInterest);

export {
  getExchangeRate,
  convertCurrency,
  getCryptoPrice,
  trackExpense,
  getSpendingSummary,
  calculateTip,
  calculateLoan,
  calculateCompoundInterest,
};
