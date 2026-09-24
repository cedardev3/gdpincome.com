/**
 * 10-year government bond yields via OECD Key Economic Indicators (IRLT)
 * through DBnomics — long-term interest rates ≈ residual maturity ~10 years.
 *
 * Missing or stale series (latest older than MIN_LATEST_YEAR) are omitted —
 * callers must not invent placeholder yields. When a latest yield exists, also
 * attach an observation ~5 years earlier when available.
 */

import { cachedFetchJson } from "./http-cache.mjs";

const DATASET = "OECD/DSD_KEI@DF_KEI";
const SOURCE = {
  label: "OECD long-term interest rates (IRLT / ~10y govt bonds)",
  url: "https://db.nomics.world/OECD/DSD_KEI@DF_KEI",
};
/** Drop series whose latest observation is before this calendar year. */
const MIN_LATEST_YEAR = 2022;

function round4(n) {
  return Math.round(n * 10000) / 10000;
}

function periodYear(period) {
  const y = Number(String(period).slice(0, 4));
  return Number.isFinite(y) ? y : null;
}

/** Rough month index for YYYY or YYYY-MM periods. */
function periodIndex(period) {
  const s = String(period);
  const y = Number(s.slice(0, 4));
  if (!Number.isFinite(y)) return null;
  const m = s.length >= 7 ? Number(s.slice(5, 7)) : 6;
  if (!Number.isFinite(m)) return y * 12 + 6;
  return y * 12 + m;
}

function usableObservations(doc) {
  const periods = doc.period ?? [];
  const values = doc.value ?? [];
  const out = [];
  for (let i = 0; i < periods.length; i++) {
    const v = values[i];
    if (v == null || Number.isNaN(Number(v))) continue;
    const idx = periodIndex(periods[i]);
    if (idx == null) continue;
    out.push({ period: String(periods[i]), value: Number(v), idx });
  }
  return out;
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
  // observations=1 tells DBnomics to include the full observation series
  const url = `https://api.db.nomics.world/v22/series/${DATASET}?dimensions=${dimensions}&limit=100&observations=1`;
  const data = await cachedFetchJson(url, {
    headers: { "User-Agent": "gdpincome.com/0.1", Accept: "application/json" },
  });
  const docs = data.series?.docs ?? [];

  const out = Object.fromEntries(iso3List.map((c) => [c, null]));
  for (const doc of docs) {
    const code = doc.dimensions?.REF_AREA;
    if (!code || !iso3List.includes(code)) continue;
    const obs = usableObservations(doc);
    if (!obs.length) {
      console.warn(`  OECD IRLT: no observations for ${code}`);
      continue;
    }
    const latest = obs[obs.length - 1];
    const latestY = periodYear(latest.period);
    if (latestY == null || latestY < MIN_LATEST_YEAR) {
      console.warn(`  OECD IRLT: no usable (>=${MIN_LATEST_YEAR}) observation for ${code}`);
      continue;
    }

    const targetIdx = latest.idx - 5 * 12;
    let prior = null;
    let bestDist = Infinity;
    for (const row of obs) {
      if (row.period === latest.period) continue;
      const dist = Math.abs(row.idx - targetIdx);
      if (dist < bestDist) {
        bestDist = dist;
        prior = row;
      }
    }
    // Require prior within ~18 months of the 5y target so we don't pair 2010 with 2025
    if (prior && bestDist > 18) prior = null;

    out[code] = {
      bondYield10y: round4(latest.value),
      bondYield10yPeriod: latest.period,
      bondYield10yUnit: "% p.a.",
      bondYield10yLabel: "10-year government bond yield",
      bondYield10yPrior5y: prior ? round4(prior.value) : null,
      bondYield10yPrior5yPeriod: prior?.period ?? null,
      sources: [SOURCE],
    };
  }

  const missing = iso3List.filter((c) => out[c] == null);
  if (missing.length) {
    console.warn(`  OECD IRLT unavailable for: ${missing.join(", ")}`);
  }
  return out;
}
