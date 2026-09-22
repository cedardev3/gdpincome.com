/**
 * 10-year government bond yields via OECD Key Economic Indicators (IRLT)
 * through DBnomics — long-term interest rates ≈ residual maturity ~10 years.
 *
 * Missing or stale series (older than MIN_PERIOD_YEAR) are omitted — callers
 * must not invent placeholder yields.
 */

import { cachedFetchJson } from "./http-cache.mjs";

const DATASET = "OECD/DSD_KEI@DF_KEI";
const SOURCE = {
  label: "OECD long-term interest rates (IRLT / ~10y govt bonds)",
  url: "https://db.nomics.world/OECD/DSD_KEI@DF_KEI",
};
/** Drop observations before this calendar year (e.g. Russia IRLT ends 2018). */
const MIN_PERIOD_YEAR = 2022;

function round4(n) {
  return Math.round(n * 10000) / 10000;
}

function periodYear(period) {
  const y = Number(String(period).slice(0, 4));
  return Number.isFinite(y) ? y : null;
}

function latestObservation(doc) {
  const periods = doc.period ?? [];
  const values = doc.value ?? [];
  for (let i = periods.length - 1; i >= 0; i--) {
    const v = values[i];
    if (v == null || Number.isNaN(Number(v))) continue;
    const y = periodYear(periods[i]);
    if (y == null || y < MIN_PERIOD_YEAR) continue;
    return { period: String(periods[i]), value: Number(v) };
  }
  return null;
}

/**
 * @param {string[]} iso3List
 * @returns {Promise<Record<string, object|null>>}
 */
export async function fetchBondYieldsBundle(iso3List) {
  const dimensions = encodeURIComponent(
    JSON.stringify({
      REF_AREA: iso3List,
      MEASURE: ["IRLT"],
      FREQ: ["M"],
      UNIT_MEASURE: ["PA"],
    }),
  );
  const url = `https://api.db.nomics.world/v22/series/${DATASET}?dimensions=${dimensions}&limit=100&observations=1`;
  const data = await cachedFetchJson(url, {
    headers: { "User-Agent": "gdpincome.com/0.1", Accept: "application/json" },
  });
  const docs = data.series?.docs ?? [];

  const out = Object.fromEntries(iso3List.map((c) => [c, null]));
  for (const doc of docs) {
    const code = doc.dimensions?.REF_AREA;
    if (!code || !iso3List.includes(code)) continue;
    const latest = latestObservation(doc);
    if (!latest) {
      console.warn(`  OECD IRLT: no usable (>=${MIN_PERIOD_YEAR}) observation for ${code}`);
      continue;
    }
    out[code] = {
      bondYield10y: round4(latest.value),
      bondYield10yPeriod: latest.period,
      bondYield10yUnit: "% p.a.",
      bondYield10yLabel: "10-year government bond yield",
      sources: [SOURCE],
    };
  }

  const missing = iso3List.filter((c) => out[c] == null);
  if (missing.length) {
    console.warn(`  OECD IRLT unavailable for: ${missing.join(", ")}`);
  }
  return out;
}
