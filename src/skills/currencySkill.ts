const USD_RATES: Record<string, number> = {
  USD: 1,
  IDR: 15850,
  EUR: 0.92,
  SGD: 1.34,
  MYR: 4.42,
  JPY: 153.5,
  GBP: 0.79,
  SAR: 3.75,
  AED: 3.67
};

/**
 * Currency pair conversion skill (/fx 100 USD IDR) inspired by tyche-nomisma.
 */
export function convertCurrencyCommand(rawText: string): {
  ok: boolean;
  amount: number;
  from: string;
  to: string;
  converted: number;
  reply: string;
} {
  const clean = rawText.replace(/^\/fx\s*/i, "").trim();
  const match = /^(\d+(?:\.\d+)?)\s+([a-zA-Z]{3})\s+(?:to\s+)?([a-zA-Z]{3})$/i.exec(clean);
  if (!match) {
    const pairOnly = /^([a-zA-Z]{3})\/?([a-zA-Z]{3})$/i.exec(clean);
    if (pairOnly) {
      return convertCurrencyCommand(`/fx 1 ${pairOnly[1]} ${pairOnly[2]}`);
    }
    return {
      ok: false,
      amount: 0,
      from: "USD",
      to: "IDR",
      converted: 0,
      reply: "Format: /fx <amount> <FROM> <TO> (contoh: /fx 29 USD IDR). Supported: " + Object.keys(USD_RATES).join(", ")
    };
  }

  const amount = Number(match[1]);
  const from = match[2].toUpperCase();
  const to = match[3].toUpperCase();

  if (!USD_RATES[from] || !USD_RATES[to]) {
    return {
      ok: false,
      amount,
      from,
      to,
      converted: 0,
      reply: `Unsupported currency pair ${from}/${to}. Supported: ${Object.keys(USD_RATES).join(", ")}`
    };
  }

  const inUsd = amount / USD_RATES[from];
  const converted = Number((inUsd * USD_RATES[to]).toFixed(2));
  return {
    ok: true,
    amount,
    from,
    to,
    converted,
    reply: `FX Rate: ${amount} ${from} = ${converted.toLocaleString("en-US")} ${to} (reference table)`
  };
}
