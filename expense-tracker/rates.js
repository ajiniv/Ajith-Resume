// Currency list and exchange rates (units of each currency per 1 USD).
export const CURRENCIES = {
  USD: "US Dollar", EUR: "Euro", GBP: "British Pound", INR: "Indian Rupee",
  AED: "UAE Dirham", SAR: "Saudi Riyal", QAR: "Qatari Riyal", OMR: "Omani Rial",
  KWD: "Kuwaiti Dinar", BHD: "Bahraini Dinar", SGD: "Singapore Dollar",
  AUD: "Australian Dollar", CAD: "Canadian Dollar", NZD: "New Zealand Dollar",
  JPY: "Japanese Yen", CNY: "Chinese Yuan", HKD: "Hong Kong Dollar",
  KRW: "South Korean Won", CHF: "Swiss Franc", SEK: "Swedish Krona",
  MYR: "Malaysian Ringgit", THB: "Thai Baht", IDR: "Indonesian Rupiah",
  PHP: "Philippine Peso", LKR: "Sri Lankan Rupee", PKR: "Pakistani Rupee",
  BDT: "Bangladeshi Taka", NPR: "Nepalese Rupee", ZAR: "South African Rand",
  TRY: "Turkish Lira", EGP: "Egyptian Pound", BRL: "Brazilian Real",
  MXN: "Mexican Peso",
};

// Approximate fallback used only until live rates have been downloaded once.
const FALLBACK = {
  USD: 1, EUR: 0.92, GBP: 0.79, INR: 84, AED: 3.6725, SAR: 3.75, QAR: 3.64,
  OMR: 0.385, KWD: 0.307, BHD: 0.376, SGD: 1.34, AUD: 1.52, CAD: 1.38,
  NZD: 1.67, JPY: 152, CNY: 7.2, HKD: 7.8, KRW: 1380, CHF: 0.88, SEK: 10.6,
  MYR: 4.4, THB: 34, IDR: 15800, PHP: 58, LKR: 295, PKR: 278, BDT: 120,
  NPR: 134.5, ZAR: 18, TRY: 34.5, EGP: 49.5, BRL: 5.7, MXN: 20,
};

const KEY = "et.rates";
const MAX_AGE = 12 * 60 * 60 * 1000;

let cache = { rates: FALLBACK, updated: 0 };
try {
  const saved = JSON.parse(localStorage.getItem(KEY));
  if (saved?.rates?.USD) cache = saved;
} catch {}

export const ratesUpdated = () => cache.updated;

export function convert(amount, from, to) {
  if (from === to) return amount;
  const r = cache.rates;
  const a = r[from] ?? FALLBACK[from];
  const b = r[to] ?? FALLBACK[to];
  return a && b ? (amount / a) * b : amount;
}

// Returns true when fresh rates were downloaded.
export async function refreshRates(force = false) {
  if (!force && Date.now() - cache.updated < MAX_AGE) return false;
  const res = await fetch("https://open.er-api.com/v6/latest/USD");
  const json = await res.json();
  if (json.result !== "success" || !json.rates?.USD) throw new Error("Rates unavailable");
  cache = { rates: json.rates, updated: Date.now() };
  localStorage.setItem(KEY, JSON.stringify(cache));
  return true;
}

export function money(amount, currency) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency", currency, maximumFractionDigits: Math.abs(amount) >= 10000 ? 0 : 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}
