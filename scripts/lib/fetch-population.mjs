/**
 * Population & age structure from World Bank WDI for all chart countries.
 * Ages 0–14 used as the closest standard under-18 proxy (exact 0–17 not in WDI).
 */

import { cachedFetchJson } from "./http-cache.mjs";

const INDICATORS = {
  population: "SP.POP.TOTL",
  pctUnder15: "SP.POP.0014.TO.ZS",
  pct65Plus: "SP.POP.65UP.TO.ZS",
};

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

async function fetchJson(url, attempts = 4) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await cachedFetchJson(url, {
        headers: { "User-Agent": "gdpincome.com/0.1" },
      });
    } catch (err) {
      lastErr = err;
      const wait = 800 * (i + 1);
      console.warn(`  WB retry ${i + 1}/${attempts} after ${(err.cause ?? err).message ?? err}…`);
      await sleep(wait);
    }
  }
  throw lastErr;
}

async function latest(iso3, indicator) {
  const url = `https://api.worldbank.org/v2/country/${iso3}/indicator/${indicator}?format=json&date=2018:2025&per_page=50`;
  const j = await fetchJson(url);
  const rows = (j[1] || []).filter((r) => r.value != null);
  if (!rows.length) return null;
  rows.sort((a, b) => Number(b.date) - Number(a.date));
  return { year: Number(rows[0].date), value: Number(rows[0].value) };
}

/**
 * @param {string[]} iso3List
 * @returns {Promise<Record<string, object>>}
 */
export async function fetchPopulationBundle(iso3List) {
  const out = {};
  const source = {
    label: "World Bank WDI population & age structure",
    url: "https://data.worldbank.org/indicator/SP.POP.TOTL",
  };

  for (const iso3 of iso3List) {
    const [pop, u15, o65] = await Promise.all([
      latest(iso3, INDICATORS.population),
      latest(iso3, INDICATORS.pctUnder15),
      latest(iso3, INDICATORS.pct65Plus),
    ]);
    if (!pop) throw new Error(`Missing population for ${iso3}`);
    out[iso3] = {
      population: Math.round(pop.value),
      populationYear: pop.year,
      pctUnder15: u15 ? Math.round(u15.value * 10) / 10 : null,
      pctUnder15Year: u15?.year ?? null,
      pct65Plus: o65 ? Math.round(o65.value * 10) / 10 : null,
      pct65PlusYear: o65?.year ?? null,
      pctUnder18Proxy: u15 ? Math.round(u15.value * 10) / 10 : null,
      under18ProxyLabel: "Ages 0–14",
      sources: [source],
    };
    // Gentle pacing so large country lists don't trip the WB edge
    await sleep(50);
  }
  return out;
}
