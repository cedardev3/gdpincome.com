/**
 * Fetch OECD National Accounts Table 6 (gross value added by industry)
 * via DBnomics for USA, CAN, AUS — build two-level ChartNode trees in USD millions.
 *
 * Source: OECD DSD_NAMAIN10@DF_TABLE6 (B1G, current prices, national currency)
 * FX: World Bank PA.NUS.FCRF (LCU per USD, period average)
 *
 * Run: node scripts/fetch-oecd-gva.mjs
 */

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const COUNTRIES = ["USA", "CAN", "AUS"];
/** Preferred year; each country uses the latest available ≤ this. */
const PREFERRED_YEAR = 2024;

const SECTOR_COLORS = {
  A: "#5a8f3c",
  B: "#8a6b3c",
  C: "#2a6f97",
  D: "#d4a017",
  E: "#3d8a7a",
  F: "#c45c26",
  G: "#2f7d6d",
  H: "#5c6b9a",
  I: "#b85c6e",
  J: "#3c6ea8",
  K: "#6b5c9a",
  L: "#8a7358",
  M: "#2a8f97",
  N: "#7a6b5c",
  O: "#5c7a8a",
  P: "#4a7a5c",
  Q: "#9a5c7a",
  R: "#c47a3c",
  S: "#6a7a8a",
  T: "#8a8a6a",
  U: "#9a9a9a",
};

const SECTOR_ORDER = Object.keys(SECTOR_COLORS);

function shade(hex, factor) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.round(((n >> 16) & 255) * factor));
  const g = Math.min(255, Math.round(((n >> 8) & 255) * factor));
  const b = Math.min(255, Math.round((n & 255) * factor));
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "gdpincome.com/0.1", Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  return res.json();
}

async function fetchCountrySeries(refArea) {
  const dimensions = encodeURIComponent(
    JSON.stringify({
      REF_AREA: [refArea],
      TRANSACTION: ["B1G"],
      PRICE_BASE: ["V"],
      UNIT_MEASURE: ["XDC"],
      SECTOR: ["S1"],
      FREQ: ["A"],
    }),
  );
  const url = `https://api.db.nomics.world/v22/series/OECD/DSD_NAMAIN10@DF_TABLE6?dimensions=${dimensions}&limit=1000&observations=1`;
  const data = await fetchJson(url);
  if (!data.series?.docs?.length) {
    throw new Error(`No TABLE6 series for ${refArea}`);
  }
  return data;
}

function valueForYear(doc, year) {
  const periods = doc.period ?? [];
  const values = doc.value ?? [];
  const idx = periods.indexOf(String(year));
  if (idx === -1) return null;
  const v = values[idx];
  if (v == null || Number.isNaN(Number(v))) return null;
  return Number(v);
}

/** Latest year ≤ preferred that has a non-null observation. */
function latestYear(doc, preferred) {
  const periods = doc.period ?? [];
  const values = doc.value ?? [];
  let best = null;
  for (let i = 0; i < periods.length; i++) {
    const y = Number(periods[i]);
    if (Number.isNaN(y) || y > preferred) continue;
    const v = values[i];
    if (v == null || Number.isNaN(Number(v))) continue;
    if (best == null || y > best) best = y;
  }
  return best;
}

async function fetchFx(yearsByCountry) {
  const years = [...new Set(Object.values(yearsByCountry))];
  const minY = Math.min(...years);
  const maxY = Math.max(...years);
  const url = `https://api.worldbank.org/v2/country/USA;CAN;AUS/indicator/PA.NUS.FCRF?format=json&date=${minY}:${maxY}`;
  const data = await fetchJson(url);
  const rows = data[1];
  if (!rows?.length) throw new Error(`No FX rates for ${minY}-${maxY}`);
  const map = {};
  for (const row of rows) {
    if (row.value == null) continue;
    map[`${row.countryiso3code}:${row.date}`] = Number(row.value);
  }
  const out = {};
  for (const [c, y] of Object.entries(yearsByCountry)) {
    const key = `${c}:${y}`;
    if (map[key] == null) throw new Error(`Missing FX for ${key}`);
    out[c] = map[key];
  }
  return out;
}

async function fetchActivityLabels() {
  const url =
    "https://api.db.nomics.world/v22/series/OECD/DSD_NAMAIN10@DF_TABLE6?limit=1&observations=0";
  const data = await fetchJson(url);
  return data.dataset.dimensions_values_labels.ACTIVITY;
}

function isSection(code) {
  return /^[A-U]$/.test(code);
}

function isDivision(code) {
  return /^[A-U]\d{2}$/.test(code);
}

function parentSection(divisionCode) {
  return divisionCode[0];
}

function shortenName(name, code) {
  // Drop trailing " activities" noise where present; keep OECD label otherwise
  let n = name.replace(/\s+activities$/i, "");
  if (n.length > 52) n = n.slice(0, 49) + "…";
  return n || code;
}

function buildTree(refArea, seriesDocs, labels, fx, year) {
  const byActivity = new Map();
  for (const doc of seriesDocs) {
    const code = doc.dimensions.ACTIVITY;
    const raw = valueForYear(doc, year);
    if (raw == null) continue;
    // OECD XDC values for these series are in millions of national currency
    const usdMillions = raw / fx;
    byActivity.set(code, { raw, usdMillions, seriesCode: doc.series_code });
  }

  const total = byActivity.get("_T");
  if (!total) {
    throw new Error(`${refArea}: missing total (_T) observations for ${year}`);
  }

  const countryNames = {
    USA: "United States",
    CAN: "Canada",
    AUS: "Australia",
  };
  const currency = { USA: "USD", CAN: "CAD", AUS: "AUD" }[refArea];

  const source = {
    label: "OECD National Accounts — Table 6 (via DBnomics)",
    url: "https://db.nomics.world/OECD/DSD_NAMAIN10@DF_TABLE6",
  };
  const fxSource = {
    label: "World Bank PA.NUS.FCRF (LCU per USD)",
    url: "https://data.worldbank.org/indicator/PA.NUS.FCRF",
  };

  const sections = [];
  for (const code of SECTOR_ORDER) {
    const row = byActivity.get(code);
    if (!row || row.usdMillions <= 0) continue;

    const label = labels[code] ?? code;
    const color = SECTOR_COLORS[code];
    const children = [];

    const divisionCodes = [...byActivity.keys()]
      .filter((c) => isDivision(c) && parentSection(c) === code)
      .sort();

    let childSum = 0;
    divisionCodes.forEach((div, i) => {
      const d = byActivity.get(div);
      if (!d || d.usdMillions <= 0) return;
      childSum += d.usdMillions;
      children.push({
        id: `${refArea.toLowerCase()}-${div.toLowerCase()}`,
        name: shortenName(labels[div] ?? div, div),
        code: div,
        amountMillions: round1(d.usdMillions),
        color: shade(color, 0.72 + (i % 5) * 0.06),
        description: `ISIC Rev. 4 division ${div}. Gross value added at current prices (${year}), converted from ${currency} using World Bank period-average exchange rate.`,
        sources: [source, fxSource],
      });
    });

    // Explicit residual when parent exceeds detailed children (missing/confidential cells)
    const residual = row.usdMillions - childSum;
    if (children.length > 0 && residual > row.usdMillions * 0.005) {
      children.push({
        id: `${refArea.toLowerCase()}-${code.toLowerCase()}-other`,
        name: "Other / not detailed",
        code: `${code}_RES`,
        amountMillions: round1(residual),
        color: shade(color, 0.55),
        description: `Residual of section ${code} after published ISIC divisions (${year}). OECD does not publish every division for every country.`,
        sources: [source, fxSource],
      });
    }

    sections.push({
      id: `${refArea.toLowerCase()}-${code.toLowerCase()}`,
      name: shortenName(label, code),
      code,
      amountMillions: round1(row.usdMillions),
      color,
      description: `ISIC Rev. 4 section ${code}. Gross value added at current prices (${year}).`,
      sources: [source, fxSource],
      ...(children.length > 0 ? { children } : {}),
    });
  }

  const sectionSum = sections.reduce((s, n) => s + n.amountMillions, 0);

  return {
    id: refArea.toLowerCase(),
    name: countryNames[refArea],
    code: refArea,
    amountMillions: round1(total.usdMillions),
    color: "#1f3d4d",
    description: `Gross value added (B1G) at basic prices, ${year}, current prices. OECD Table 6; amounts in USD millions (converted from ${currency} at ${fx.toFixed(4)} LCU/USD). Section total ${round1(sectionSum).toLocaleString()} vs published total ${round1(total.usdMillions).toLocaleString()}.`,
    sources: [source, fxSource],
    year,
    currency,
    fxLcuPerUsd: fx,
    children: sections,
  };
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

function toTsModule(trees, meta) {
  const byCode = Object.fromEntries(trees.map((t) => [t.code, t]));
  return `import type { ChartNode } from "@/lib/pie";

/**
 * Auto-generated by scripts/fetch-oecd-gva.mjs — do not edit by hand.
 * OECD National Accounts Table 6 (gross value added by industry) via DBnomics.
 */

export type CountryGdpTree = ChartNode & {
  year: number;
  currency: string;
  fxLcuPerUsd: number;
};

export const GDP_DATA_META = ${JSON.stringify(meta, null, 2)} as const;

export const COUNTRY_GDP = ${JSON.stringify(byCode, null, 2)} as unknown as Record<
  string,
  CountryGdpTree
>;

export const COUNTRY_ORDER = ${JSON.stringify(
    trees.map((t) => t.code),
  )} as const;
`;
}

async function main() {
  console.log("Fetching activity labels…");
  const labels = await fetchActivityLabels();

  const payloads = {};
  const yearsByCountry = {};
  for (const code of COUNTRIES) {
    console.log(`Fetching TABLE6 for ${code}…`);
    const payload = await fetchCountrySeries(code);
    payloads[code] = payload;
    const totalDoc = payload.series.docs.find(
      (d) => d.dimensions.ACTIVITY === "_T",
    );
    if (!totalDoc) throw new Error(`${code}: no _T series`);
    const year = latestYear(totalDoc, PREFERRED_YEAR);
    if (year == null) throw new Error(`${code}: no usable year ≤ ${PREFERRED_YEAR}`);
    yearsByCountry[code] = year;
    console.log(`  ${payload.series.docs.length} series, year=${year}`);
  }

  console.log("Fetching FX…", yearsByCountry);
  const fx = await fetchFx(yearsByCountry);
  console.log(fx);

  const trees = [];
  for (const code of COUNTRIES) {
    const year = yearsByCountry[code];
    const tree = buildTree(
      code,
      payloads[code].series.docs,
      labels,
      fx[code],
      year,
    );
    console.log(
      `  ${tree.name}: $${(tree.amountMillions / 1000).toFixed(1)}B GVA, ${tree.children.length} sections`,
    );
    trees.push(tree);
  }

  const meta = {
    preferredYear: PREFERRED_YEAR,
    yearsByCountry,
    fetchedAt: new Date().toISOString(),
    dataset: "OECD/DSD_NAMAIN10@DF_TABLE6",
    transaction: "B1G",
    priceBase: "V",
    unit: "XDC millions → USD millions via WB PA.NUS.FCRF",
    sourceUrl: "https://db.nomics.world/OECD/DSD_NAMAIN10@DF_TABLE6",
  };

  const outPath = join(ROOT, "src", "data", "countries.ts");
  writeFileSync(outPath, toTsModule(trees, meta), "utf8");
  console.log(`Wrote ${outPath}`);

  // Also write a compact JSON for inspection
  const jsonPath = join(ROOT, "src", "data", "countries.snapshot.json");
  writeFileSync(
    jsonPath,
    JSON.stringify({ meta, countries: trees }, null, 2),
    "utf8",
  );
  console.log(`Wrote ${jsonPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
