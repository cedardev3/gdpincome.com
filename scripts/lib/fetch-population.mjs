/**
 * Population & age structure from World Bank WDI for all chart countries.
 * Ages 0–14 used as the closest standard under-18 proxy (exact 0–17 not in WDI).
 * Also pulls a ~5-year prior observation and World Bank GDP/capita for deltas.
 */

import { cachedFetchJson } from "./http-cache.mjs";

const INDICATORS = {
  population: "SP.POP.TOTL",
  pctUnder15: "SP.POP.0014.TO.ZS",
  pct65Plus: "SP.POP.65UP.TO.ZS",
  gdpPerCapita: "NY.GDP.PCAP.CD",
  /** Consumer price index — cumulative 5y inflation from index ratio. */
  cpi: "FP.CPI.TOTL",
};

const DATE_RANGE = "2015:2025";

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

/** Latest + observation nearest to (latestYear - 5). */
async function latestAndPrior5y(iso3, indicator) {
  const url = `https://api.worldbank.org/v2/country/${iso3}/indicator/${indicator}?format=json&date=${DATE_RANGE}&per_page=100`;
  const j = await fetchJson(url);
  const rows = (j[1] || [])
    .filter((r) => r.value != null)
    .map((r) => ({ year: Number(r.date), value: Number(r.value) }))
    .filter((r) => Number.isFinite(r.year) && Number.isFinite(r.value));
  if (!rows.length) return { latest: null, prior: null };
  rows.sort((a, b) => b.year - a.year);
  const latest = rows[0];
  const target = latest.year - 5;
  let prior = null;
  let bestDist = Infinity;
  for (const row of rows) {
    if (row.year === latest.year) continue;
    const dist = Math.abs(row.year - target);
    if (dist < bestDist) {
      bestDist = dist;
      prior = row;
    }
  }
  if (prior && bestDist > 1) {
    const exactish = rows.find((r) => r.year === target);
    if (exactish) prior = exactish;
  }
  return { latest, prior };
}

function round1(n) {
  return Math.round(n * 10) / 10;
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
  const pcapSource = {
    label: "World Bank WDI GDP per capita (current US$)",
    url: "https://data.worldbank.org/indicator/NY.GDP.PCAP.CD",
  };

  const cpiSource = {
    label: "World Bank WDI consumer price index (FP.CPI.TOTL)",
    url: "https://data.worldbank.org/indicator/FP.CPI.TOTL",
  };

  for (const iso3 of iso3List) {
    const [pop, u15, o65, pcap, cpi] = await Promise.all([
      latestAndPrior5y(iso3, INDICATORS.population),
      latestAndPrior5y(iso3, INDICATORS.pctUnder15),
      latestAndPrior5y(iso3, INDICATORS.pct65Plus),
      latestAndPrior5y(iso3, INDICATORS.gdpPerCapita),
      latestAndPrior5y(iso3, INDICATORS.cpi),
    ]);
    if (!pop.latest) throw new Error(`Missing population for ${iso3}`);

    let inflationCumulative5yPct = null;
    if (
      cpi.latest &&
      cpi.prior &&
      cpi.prior.value > 0 &&
      Number.isFinite(cpi.latest.value)
    ) {
      inflationCumulative5yPct =
        Math.round(((cpi.latest.value / cpi.prior.value) - 1) * 1000) / 10;
    }

    out[iso3] = {
      population: Math.round(pop.latest.value),
      populationYear: pop.latest.year,
      populationPrior5y: pop.prior ? Math.round(pop.prior.value) : null,
      populationPrior5yYear: pop.prior?.year ?? null,
      pctUnder15: u15.latest ? round1(u15.latest.value) : null,
      pctUnder15Year: u15.latest?.year ?? null,
      pctUnder15Prior5y: u15.prior ? round1(u15.prior.value) : null,
      pctUnder15Prior5yYear: u15.prior?.year ?? null,
      pct65Plus: o65.latest ? round1(o65.latest.value) : null,
      pct65PlusYear: o65.latest?.year ?? null,
      pct65PlusPrior5y: o65.prior ? round1(o65.prior.value) : null,
      pct65PlusPrior5yYear: o65.prior?.year ?? null,
      pctUnder18Proxy: u15.latest ? round1(u15.latest.value) : null,
      under18ProxyLabel: "Ages 0–14",
      /** World Bank GDP/capita — used for consistent 5y change (industry÷pop is the chart headline). */
      gdpPerCapitaWbUsd: pcap.latest ? Math.round(pcap.latest.value) : null,
      gdpPerCapitaWbYear: pcap.latest?.year ?? null,
      gdpPerCapitaWbPrior5yUsd: pcap.prior ? Math.round(pcap.prior.value) : null,
      gdpPerCapitaWbPrior5yYear: pcap.prior?.year ?? null,
      cpiIndex: cpi.latest ? round1(cpi.latest.value) : null,
      cpiYear: cpi.latest?.year ?? null,
      cpiPrior5y: cpi.prior ? round1(cpi.prior.value) : null,
      cpiPrior5yYear: cpi.prior?.year ?? null,
      /** Cumulative CPI rise over ~5 years (positive = prices up). */
      inflationCumulative5yPct,
      sources: [source, pcapSource, cpiSource],
    };
    await sleep(50);
  }
  return out;
}
