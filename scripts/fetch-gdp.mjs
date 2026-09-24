/**
 * Fetch industry GDP trees for the largest selected economies.
 *
 * Primary sources:
 * - USA: BEA GDP by Industry via FRED
 * - Canada: Statistics Canada 36-10-0434
 * - Australia: ABS ANA_IND_GVA / GDP(P)
 * - EU/EEA: Eurostat nama_10_a10 + nama_10_a64
 * - Emerging / others: World Bank WDI sector VA
 * - JPN/GBR/MEX/TUR/CHE: OECD Table 6
 *
 * Fallback: OECD Table 6 via DBnomics when a primary fetch fails.
 * Demographics: World Bank WDI. Bond yields: OECD IRLT (optional if missing).
 *
 * Run: node scripts/fetch-gdp.mjs
 */

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { fetchUsaFromFred } from "./lib/fetch-usa-fred.mjs";
import { fetchAusFromAbs } from "./lib/fetch-aus-abs.mjs";
import { fetchEurostatCountries } from "./lib/fetch-eurostat.mjs";
import { fetchWorldBankIndustry } from "./lib/fetch-worldbank-industry.mjs";
import { fetchPopulationBundle } from "./lib/fetch-population.mjs";
import { fetchBondYieldsBundle } from "./lib/fetch-bond-yields.mjs";
import { cachedFetchJson } from "./lib/http-cache.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OECD_PREFERRED_YEAR = 2024;
/** First expansion after USA + CA/AU. */
const BATCH1_CODES = ["CHN", "DEU", "JPN", "GBR", "IND", "FRA", "ITA"];
/** Next 10 by World Bank GDP after the prior set. */
const BATCH2_CODES = ["RUS", "BRA", "ESP", "KOR", "MEX", "TUR", "IDN", "NLD", "SAU", "CHE"];
/**
 * Completeness batch: top-30 closure + regional anchors (Africa, Gulf, SE Asia, Nordics, CEE).
 * Eurostat for EU/EEA; World Bank sector VA otherwise.
 */
const BATCH3_CODES = [
  "POL", "BEL", "IRL", "ARG", "SWE", "NOR", "THA", "ARE", "SGP",
  "NGA", "ZAF", "AUT", "ISR", "EGY", "VNM", "BGD",
];
/**
 * Top-45 closure (IMF 2024 nominal). Taiwan omitted — no World Bank / OECD
 * industry series in our feeds. Eurostat for DK/RO/CZ; World Bank otherwise.
 */
const BATCH4_CODES = [
  "PHL", "DNK", "MYS", "COL", "IRN", "HKG", "ROU", "PAK", "CZE",
];
const WB_INDUSTRY_CODES = [
  "CHN", "IND", "RUS", "BRA", "KOR", "IDN", "SAU",
  "ARG", "THA", "ARE", "SGP", "NGA", "ZAF", "ISR", "EGY", "VNM", "BGD",
  "PHL", "MYS", "COL", "IRN", "HKG", "PAK",
];
const EUROSTAT_GEOS = [
  "DE", "FR", "IT", "ES", "NL", "PL", "BE", "IE", "SE", "NO", "AT",
  "DK", "RO", "CZ",
];
const OECD_PRIMARY_CODES = ["JPN", "GBR", "MEX", "TUR", "CHE"];
const ALL_ISO3 = [
  "USA", "CHN", "DEU", "JPN", "GBR", "IND", "FRA", "ITA", "CAN", "AUS",
  ...BATCH2_CODES,
  ...BATCH3_CODES,
  ...BATCH4_CODES,
];
const FX_PROVISIONAL_CODES = [
  ...BATCH1_CODES,
  ...BATCH2_CODES,
  ...BATCH3_CODES,
  ...BATCH4_CODES,
];
const STATCAN_PRODUCT_ID = 36100434;
const STATCAN_COORD = (naicsMemberId) =>
  `1.1.1.${naicsMemberId}.0.0.0.0.0.0`;

const STATCAN_SECTOR_IDS = [
  20, 27, 45, 49, 54, 149, 159, 172, 189, 198, 210, 220, 232, 233, 243, 248, 254,
  259, 262, 267,
];

const STATCAN_SECTOR_COLORS = [
  "#5a8f3c", "#8a6b3c", "#d4a017", "#c45c26", "#2a6f97", "#2f7d6d", "#3d8a7a",
  "#5c6b9a", "#3c6ea8", "#6b5c9a", "#8a7358", "#2a8f97", "#7a6b5c", "#5c7a8a",
  "#4a7a5c", "#9a5c7a", "#c47a3c", "#b85c6e", "#6a7a8a", "#1f3d4d",
];

const SECTOR_COLORS = {
  A: "#5a8f3c", B: "#8a6b3c", C: "#2a6f97", D: "#d4a017", E: "#3d8a7a",
  F: "#c45c26", G: "#2f7d6d", H: "#5c6b9a", I: "#b85c6e", J: "#3c6ea8",
  K: "#6b5c9a", L: "#8a7358", M: "#2a8f97", N: "#7a6b5c", O: "#5c7a8a",
  P: "#4a7a5c", Q: "#9a5c7a", R: "#c47a3c", S: "#6a7a8a", T: "#8a8a6a",
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
function round1(n) {
  return Math.round(n * 10) / 10;
}
function shortenName(name, code) {
  let n = String(name)
    .replace(/\s+activities$/i, "")
    .replace(/\s+\(except public administration\)$/i, "");
  if (n.length > 52) n = n.slice(0, 49) + "…";
  return n || String(code);
}

async function fetchJson(url, init) {
  return cachedFetchJson(url, {
    headers: {
      "User-Agent": "gdpincome.com/0.1",
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });
}

async function fetchFx(yearsByCountry) {
  const codes = Object.keys(yearsByCountry);
  const years = [...new Set(Object.values(yearsByCountry))];
  const minY = Math.min(...years, 2020);
  const maxY = Math.max(...years);
  const rows = [];
  // World Bank caps multi-country responses; fetch in chunks.
  for (let i = 0; i < codes.length; i += 12) {
    const chunk = codes.slice(i, i + 12).join(";");
    const url = `https://api.worldbank.org/v2/country/${chunk}/indicator/PA.NUS.FCRF?format=json&date=${minY}:${maxY}&per_page=500`;
    const data = await fetchJson(url);
    if (data[1]?.length) rows.push(...data[1]);
  }
  if (!rows.length) throw new Error(`No FX rates for ${minY}-${maxY}`);
  const latestByCountry = {};
  for (const row of rows) {
    if (row.value == null) continue;
    const y = Number(row.date);
    const code = row.countryiso3code;
    const prev = latestByCountry[code];
    if (!prev || y > prev.year) {
      latestByCountry[code] = { year: y, rate: Number(row.value) };
    }
  }
  const rates = {};
  const fxYears = {};
  for (const [c, y] of Object.entries(yearsByCountry)) {
    const exact = rows.find(
      (r) => r.countryiso3code === c && Number(r.date) === y && r.value != null,
    );
    if (exact) {
      rates[c] = Number(exact.value);
      fxYears[c] = y;
    } else {
      const hit = latestByCountry[c];
      if (!hit) throw new Error(`Missing FX for ${c}`);
      rates[c] = hit.rate;
      fxYears[c] = hit.year;
      console.warn(`  FX: ${c} has no WB rate for ${y}; using ${hit.year}`);
    }
  }
  return { rates, fxYears };
}

// --- Statistics Canada -------------------------------------------------------

async function fetchStatCanMetadata() {
  const data = await fetchJson(
    "https://www150.statcan.gc.ca/t1/wds/rest/getCubeMetadata",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([{ productId: STATCAN_PRODUCT_ID }]),
    },
  );
  const cube = data[0]?.object;
  if (!cube) throw new Error("StatCan metadata missing");
  return cube;
}

async function fetchStatCanValues(memberIds, latestN) {
  const byId = new Map();
  const chunkSize = 40;
  for (let i = 0; i < memberIds.length; i += chunkSize) {
    const chunk = memberIds.slice(i, i + chunkSize);
    const body = chunk.map((id) => ({
      productId: STATCAN_PRODUCT_ID,
      coordinate: STATCAN_COORD(id),
      latestN,
    }));
    const data = await fetchJson(
      "https://www150.statcan.gc.ca/t1/wds/rest/getDataFromCubePidCoordAndLatestNPeriods",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    for (const row of data) {
      if (row.status !== "SUCCESS" || !row.object?.vectorDataPoint?.length) continue;
      const naicsId = Number(row.object.coordinate.split(".")[3]);
      byId.set(naicsId, row.object.vectorDataPoint);
    }
  }
  return byId;
}

function valueAtPeriod(points, refPer) {
  const hit = points.find((p) => p.refPer === refPer);
  if (!hit || hit.value == null) return null;
  return Number(hit.value);
}

function latestMonthRef(points) {
  if (!points?.length) return null;
  return [...points].sort((a, b) => String(a.refPer).localeCompare(String(b.refPer))).at(-1)
    .refPer;
}

function formatMonthLabel(refPer) {
  const d = new Date(refPer);
  if (Number.isNaN(d.getTime())) return String(refPer).slice(0, 7);
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}

function buildStatCanTree(cube, valuesByMember, fx, refPer) {
  const ind = cube.dimension.find((d) => /NAICS|Industry/i.test(d.dimensionNameEn));
  if (!ind) throw new Error("StatCan NAICS dimension missing");
  const members = ind.member;
  const byId = Object.fromEntries(members.map((m) => [Number(m.memberId), m]));
  const childrenOf = (pid) =>
    members.filter((m) => Number(m.parentMemberId) === Number(pid));
  const year = Number(String(refPer).slice(0, 4));
  const periodLabel = formatMonthLabel(refPer);
  const source = {
    label: "Statistics Canada Table 36-10-0434",
    url: "https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=3610043401",
  };
  const fxSource = {
    label: "World Bank PA.NUS.FCRF (LCU per USD)",
    url: "https://data.worldbank.org/indicator/PA.NUS.FCRF",
  };
  function cadMillions(memberId) {
    const pts = valuesByMember.get(Number(memberId));
    if (!pts) return null;
    return valueAtPeriod(pts, refPer);
  }
  const totalCad = cadMillions(1);
  if (totalCad == null) throw new Error(`Canada: missing All industries for ${refPer}`);

  const sections = [];
  STATCAN_SECTOR_IDS.forEach((sectorId, sectorIndex) => {
    const meta = byId[sectorId];
    const cad = cadMillions(sectorId);
    if (!meta || cad == null || cad <= 0) return;
    const color = STATCAN_SECTOR_COLORS[sectorIndex % STATCAN_SECTOR_COLORS.length];
    const usd = cad / fx;
    const children = [];
    let childSum = 0;
    childrenOf(sectorId).forEach((kid, i) => {
      const kidCad = cadMillions(kid.memberId);
      if (kidCad == null || kidCad <= 0) return;
      childSum += kidCad / fx;
      children.push({
        id: `can-naics-${kid.memberId}`,
        name: shortenName(kid.memberNameEn, kid.memberId),
        code: String(kid.memberId),
        amountMillions: round1(kidCad / fx),
        color: shade(color, 0.72 + (i % 5) * 0.06),
        description: `NAICS detail under ${meta.memberNameEn}. GDP at basic prices as of ${periodLabel}, monthly SAAR, chained 2017 dollars.`,
        sources: [source, fxSource],
        year,
        periodLabel,
      });
    });
    const residual = usd - childSum;
    if (children.length > 0 && residual > usd * 0.005) {
      children.push({
        id: `can-naics-${sectorId}-other`,
        name: "Other / not detailed",
        code: `${sectorId}_RES`,
        amountMillions: round1(residual),
        color: shade(color, 0.55),
        description: `Residual of ${meta.memberNameEn} (${periodLabel}).`,
        sources: [source, fxSource],
        year,
        periodLabel,
      });
    }
    sections.push({
      id: `can-naics-${sectorId}`,
      name: shortenName(meta.memberNameEn, sectorId),
      code: String(sectorId),
      amountMillions: round1(usd),
      color,
      description: `NAICS ${meta.memberNameEn}. GDP at basic prices as of ${periodLabel}, monthly SAAR, chained 2017 dollars.`,
      sources: [source, fxSource],
      year,
      periodLabel,
      ...(children.length > 0 ? { children } : {}),
    });
  });

  return {
    id: "can",
    name: "Canada",
    code: "CAN",
    amountMillions: round1(totalCad / fx),
    color: "#c45c26",
    description: `GDP at basic prices by industry as of ${periodLabel}, SAAR, chained 2017 dollars (Statistics Canada 36-10-0434). USD at ${fx.toFixed(4)} CAD/USD.`,
    sources: [source, fxSource],
    year,
    periodLabel,
    currency: "CAD",
    fxLcuPerUsd: fx,
    sourceKey: "statcan",
    children: sections,
  };
}

async function fetchCanada() {
  const cube = await fetchStatCanMetadata();
  const ind = cube.dimension.find((d) => /NAICS|Industry/i.test(d.dimensionNameEn));
  const childrenOf = (pid) =>
    ind.member.filter((m) => Number(m.parentMemberId) === Number(pid));
  const memberIds = new Set([1, ...STATCAN_SECTOR_IDS]);
  for (const sectorId of STATCAN_SECTOR_IDS) {
    for (const kid of childrenOf(sectorId)) memberIds.add(Number(kid.memberId));
  }
  const valuesByMember = await fetchStatCanValues([...memberIds], 24);
  const allPts = valuesByMember.get(1);
  const refPer = latestMonthRef(allPts);
  if (!refPer) throw new Error("Canada: no latest month");
  return { refPer, year: Number(String(refPer).slice(0, 4)), cube, valuesByMember };
}

// --- OECD fallback -----------------------------------------------------------

async function fetchOecdCountrySeries(refArea) {
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
  if (!data.series?.docs?.length) throw new Error(`No TABLE6 series for ${refArea}`);
  return data;
}

async function fetchActivityLabels() {
  const url =
    "https://api.db.nomics.world/v22/series/OECD/DSD_NAMAIN10@DF_TABLE6?limit=1&observations=0";
  const data = await fetchJson(url);
  return data.dataset.dimensions_values_labels.ACTIVITY;
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

function isDivision(code) {
  return /^[A-U]\d{2}$/.test(code);
}

function buildOecdTree(refArea, seriesDocs, labels, fx, year) {
  const byActivity = new Map();
  for (const doc of seriesDocs) {
    const code = doc.dimensions.ACTIVITY;
    const raw = valueForYear(doc, year);
    if (raw == null) continue;
    byActivity.set(code, { usdMillions: raw / fx });
  }
  const total = byActivity.get("_T");
  if (!total) throw new Error(`${refArea}: missing _T for ${year}`);
  const countryNames = {
    USA: "United States", AUS: "Australia", CAN: "Canada", JPN: "Japan",
    GBR: "United Kingdom", DEU: "Germany", FRA: "France", ITA: "Italy",
    CHN: "China", IND: "India", RUS: "Russia", BRA: "Brazil", ESP: "Spain",
    KOR: "South Korea", MEX: "Mexico", TUR: "Türkiye", IDN: "Indonesia",
    NLD: "Netherlands", SAU: "Saudi Arabia", CHE: "Switzerland",
    POL: "Poland", BEL: "Belgium", IRL: "Ireland", ARG: "Argentina",
    SWE: "Sweden", NOR: "Norway", THA: "Thailand", ARE: "United Arab Emirates",
    SGP: "Singapore", NGA: "Nigeria", ZAF: "South Africa", AUT: "Austria",
    ISR: "Israel", EGY: "Egypt", VNM: "Vietnam", BGD: "Bangladesh",
  };
  const currency = {
    USA: "USD", AUS: "AUD", CAN: "CAD", JPN: "JPY", GBR: "GBP", DEU: "EUR",
    FRA: "EUR", ITA: "EUR", CHN: "CNY", IND: "INR", RUS: "RUB", BRA: "BRL",
    ESP: "EUR", KOR: "KRW", MEX: "MXN", TUR: "TRY", IDN: "IDR", NLD: "EUR",
    SAU: "SAR", CHE: "CHF", POL: "PLN", BEL: "EUR", IRL: "EUR", ARG: "ARS",
    SWE: "SEK", NOR: "NOK", THA: "THB", ARE: "AED", SGP: "SGD", NGA: "NGN",
    ZAF: "ZAR", AUT: "EUR", ISR: "ILS", EGY: "EGP", VNM: "VND", BGD: "BDT",
  }[refArea];
  if (!currency) throw new Error(`No currency map for OECD ${refArea}`);
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
    const color = SECTOR_COLORS[code];
    const children = [];
    let childSum = 0;
    [...byActivity.keys()]
      .filter((c) => isDivision(c) && c[0] === code)
      .sort()
      .forEach((div, i) => {
        const d = byActivity.get(div);
        if (!d || d.usdMillions <= 0) return;
        childSum += d.usdMillions;
        children.push({
          id: `${refArea.toLowerCase()}-${div.toLowerCase()}`,
          name: shortenName(labels[div] ?? div, div),
          code: div,
          amountMillions: round1(d.usdMillions),
          color: shade(color, 0.72 + (i % 5) * 0.06),
          description: `ISIC division ${div}. OECD GVA current prices (${year}).`,
          sources: [source, fxSource],
          year,
          periodLabel: String(year),
        });
      });
    const residual = row.usdMillions - childSum;
    if (children.length > 0 && residual > row.usdMillions * 0.005) {
      children.push({
        id: `${refArea.toLowerCase()}-${code.toLowerCase()}-other`,
        name: "Other / not detailed",
        code: `${code}_RES`,
        amountMillions: round1(residual),
        color: shade(color, 0.55),
        description: `Residual of section ${code} (${year}).`,
        sources: [source, fxSource],
        year,
        periodLabel: String(year),
      });
    }
    sections.push({
      id: `${refArea.toLowerCase()}-${code.toLowerCase()}`,
      name: shortenName(labels[code] ?? code, code),
      code,
      amountMillions: round1(row.usdMillions),
      color,
      description: `ISIC section ${code}. OECD GVA current prices (${year}).`,
      sources: [source, fxSource],
      year,
      periodLabel: String(year),
      ...(children.length > 0 ? { children } : {}),
    });
  }
  const oecdColors = {
    USA: "#2a6f97",
    AUS: "#2f7d6d",
    CAN: "#c45c26",
    JPN: "#8a5a3c",
    GBR: "#3c6ea8",
    DEU: "#1f3d4d",
    FRA: "#2a6f97",
    ITA: "#2f7d6d",
    CHN: "#c45c26",
    IND: "#d4a017",
    RUS: "#6b5c9a",
    BRA: "#2f7d6d",
    ESP: "#c45c26",
    KOR: "#3c6ea8",
    MEX: "#5a8f3c",
    TUR: "#c45c26",
    IDN: "#8a5a3c",
    NLD: "#3d8a7a",
    SAU: "#8a7358",
    CHE: "#5c6b9a",
  };
  return {
    id: refArea.toLowerCase(),
    name: countryNames[refArea],
    code: refArea,
    amountMillions: round1(total.usdMillions),
    color: oecdColors[refArea] ?? "#5c6b9a",
    description: `OECD Table 6 GVA for ${year}; USD from ${currency} at ${fx.toFixed(4)}.`,
    sources: [source, fxSource],
    year,
    periodLabel: String(year),
    currency,
    fxLcuPerUsd: fx,
    sourceKey: "oecd",
    children: sections,
  };
}

async function fetchOecdFallback(refArea, fx) {
  console.warn(`  Falling back to OECD for ${refArea}…`);
  const labels = await fetchActivityLabels();
  const payload = await fetchOecdCountrySeries(refArea);
  const totalDoc = payload.series.docs.find((d) => d.dimensions.ACTIVITY === "_T");
  const year = latestYear(totalDoc, OECD_PREFERRED_YEAR);
  if (year == null) throw new Error(`${refArea}: OECD has no usable year`);
  return buildOecdTree(refArea, payload.series.docs, labels, fx, year);
}

function toTsModule(world, trees, meta) {
  const byCode = Object.fromEntries(trees.map((t) => [t.code, t]));
  return `import type { ChartNode } from "@/lib/pie";

/**
 * Auto-generated by scripts/fetch-gdp.mjs — do not edit by hand.
 * Primary: BEA/FRED, StatCan, ABS, Eurostat, World Bank industry; OECD for JP/GB (+ fallback).
 * Demographics: World Bank WDI. Under-18 uses ages 0–14 (closest published cohort).
 * Bond yields: OECD KEI IRLT (long-term / ~10y government bond rates) via DBnomics.
 */

export type CountryGdpTree = ChartNode & {
  year: number;
  periodLabel?: string;
  currency: string;
  fxLcuPerUsd: number;
  sourceKey?: "bea" | "statcan" | "abs" | "eurostat" | "worldbank" | "oecd";
  population?: number;
  populationYear?: number;
  gdpPerCapitaUsd?: number;
  pctUnder15?: number | null;
  pctUnder15Year?: number | null;
  pct65Plus?: number | null;
  pct65PlusYear?: number | null;
  pctUnder18Proxy?: number | null;
  under18ProxyLabel?: string;
  bondYield10y?: number;
  bondYield10yPeriod?: string;
  bondYield10yUnit?: string;
  bondYield10yLabel?: string;
};

export const GDP_DATA_META = ${JSON.stringify(meta, null, 2)} as const;

export const WORLD_GDP = ${JSON.stringify(world, null, 2)} as unknown as ChartNode;

export const COUNTRY_GDP = ${JSON.stringify(byCode, null, 2)} as unknown as Record<
  string,
  CountryGdpTree
>;

export const COUNTRY_ORDER = ${JSON.stringify(
    trees.map((t) => t.code),
  )} as const;
`;
}

function attachDemographics(tree, pop, yieldRow) {
  const gdpPerCapitaUsd = Math.round((tree.amountMillions * 1e6) / pop.population);
  const yieldFields = yieldRow
    ? {
        bondYield10y: yieldRow.bondYield10y,
        bondYield10yPeriod: yieldRow.bondYield10yPeriod,
        bondYield10yUnit: yieldRow.bondYield10yUnit,
        bondYield10yLabel: yieldRow.bondYield10yLabel,
      }
    : {};
  return {
    ...tree,
    population: pop.population,
    populationYear: pop.populationYear,
    gdpPerCapitaUsd,
    pctUnder15: pop.pctUnder15,
    pctUnder15Year: pop.pctUnder15Year,
    pct65Plus: pop.pct65Plus,
    pct65PlusYear: pop.pct65PlusYear,
    pctUnder18Proxy: pop.pctUnder18Proxy,
    under18ProxyLabel: pop.under18ProxyLabel,
    ...yieldFields,
    sources: [
      ...(tree.sources ?? []),
      ...(pop.sources ?? []),
      ...((yieldRow && yieldRow.sources) || []),
    ],
  };
}

async function fetchOecdPrimary(refArea, fx) {
  console.log(`  Fetching OECD Table 6 for ${refArea}…`);
  const labels = await fetchActivityLabels();
  const payload = await fetchOecdCountrySeries(refArea);
  const totalDoc = payload.series.docs.find((d) => d.dimensions.ACTIVITY === "_T");
  const year = latestYear(totalDoc, OECD_PREFERRED_YEAR);
  if (year == null) throw new Error(`${refArea}: OECD has no usable year`);
  return buildOecdTree(refArea, payload.series.docs, labels, fx, year);
}

async function main() {
  const trees = [];
  const yearsByCountry = {};
  const periodByCountry = {};
  const usedFallback = [];
  const sourceByCountry = {};

  console.log("Fetching USA from BEA/FRED…");
  let usa;
  try {
    usa = await fetchUsaFromFred();
    console.log(`  ${usa.name}: $${(usa.amountMillions / 1000).toFixed(1)}B · ${usa.periodLabel}`);
  } catch (err) {
    console.error("  USA national fetch failed:", err.message);
  }

  console.log("Fetching Canada from Statistics Canada…");
  const canPack = await fetchCanada();
  yearsByCountry.CAN = canPack.year;
  periodByCountry.CAN = canPack.refPer;
  console.log(`  latest month=${canPack.refPer}`);

  yearsByCountry.AUS = new Date().getUTCFullYear();
  if (usa) yearsByCountry.USA = usa.year;
  else yearsByCountry.USA = OECD_PREFERRED_YEAR;
  for (const c of FX_PROVISIONAL_CODES) yearsByCountry[c] = OECD_PREFERRED_YEAR;

  console.log("Fetching FX…", yearsByCountry);
  let { rates: fx, fxYears } = await fetchFx(yearsByCountry);
  console.log(fx, fxYears);

  if (!usa) {
    usa = await fetchOecdFallback("USA", fx.USA);
    usedFallback.push("USA");
  }
  trees.push(usa);
  periodByCountry.USA = usa.periodLabel ?? String(usa.year);
  sourceByCountry.USA = usa.sourceKey ?? "bea";

  const canTree = buildStatCanTree(
    canPack.cube,
    canPack.valuesByMember,
    fx.CAN,
    canPack.refPer,
  );
  console.log(`  ${canTree.name}: $${(canTree.amountMillions / 1000).toFixed(1)}B · ${canTree.periodLabel}`);
  trees.push(canTree);
  sourceByCountry.CAN = "statcan";

  console.log("Fetching Australia from ABS…");
  let aus;
  try {
    aus = await fetchAusFromAbs(fx.AUS);
    console.log(`  ${aus.name}: $${(aus.amountMillions / 1000).toFixed(1)}B · ${aus.periodLabel}`);
  } catch (err) {
    console.error("  AUS national fetch failed:", err.message);
    aus = await fetchOecdFallback("AUS", fx.AUS);
    usedFallback.push("AUS");
  }
  trees.push(aus);
  yearsByCountry.AUS = aus.year;
  periodByCountry.AUS = aus.periodLabel ?? String(aus.year);
  sourceByCountry.AUS = aus.sourceKey ?? "abs";

  console.log("Fetching Eurostat (EU/EEA geos)…");
  const eurPerUsd = fx.DEU;
  if (eurPerUsd == null) throw new Error("Missing EUR/USD FX (DEU)");
  try {
    const euTrees = await fetchEurostatCountries(EUROSTAT_GEOS, eurPerUsd);
    for (const t of euTrees) {
      trees.push(t);
      yearsByCountry[t.code] = t.year;
      periodByCountry[t.code] = t.periodLabel;
      sourceByCountry[t.code] = "eurostat";
      console.log(`  ${t.name}: $${(t.amountMillions / 1000).toFixed(1)}B · ${t.periodLabel}`);
    }
  } catch (err) {
    console.error("  Eurostat failed:", err.message);
    for (const code of [
      "DEU", "FRA", "ITA", "ESP", "NLD", "POL", "BEL", "IRL", "SWE", "NOR", "AUT",
      "DNK", "ROU", "CZE",
    ]) {
      const t = await fetchOecdFallback(code, fx[code]);
      trees.push(t);
      yearsByCountry[code] = t.year;
      periodByCountry[code] = String(t.year);
      sourceByCountry[code] = "oecd";
      usedFallback.push(code);
    }
  }

  console.log("Fetching World Bank industry…");
  for (const code of WB_INDUSTRY_CODES) {
    let ok = false;
    for (let attempt = 1; attempt <= 3 && !ok; attempt++) {
      try {
        const t = await fetchWorldBankIndustry(code);
        trees.push(t);
        yearsByCountry[code] = t.year;
        periodByCountry[code] = t.periodLabel;
        sourceByCountry[code] = "worldbank";
        console.log(`  ${t.name}: $${(t.amountMillions / 1000).toFixed(1)}B · ${t.periodLabel}`);
        ok = true;
      } catch (err) {
        console.error(`  ${code} WB attempt ${attempt} failed:`, err.message);
        if (attempt < 3) await new Promise((r) => setTimeout(r, 800 * attempt));
      }
    }
    if (!ok) {
      try {
        const t = await fetchOecdFallback(code, fx[code] ?? 1);
        trees.push(t);
        yearsByCountry[code] = t.year;
        periodByCountry[code] = String(t.year);
        sourceByCountry[code] = "oecd";
        usedFallback.push(code);
      } catch (oecdErr) {
        throw new Error(
          `${code}: World Bank and OECD both failed (${oecdErr.message})`,
        );
      }
    }
  }

  console.log("Fetching OECD Table 6 (JP, GB, MX, TR, CH)…");
  for (const code of OECD_PRIMARY_CODES) {
    const t = await fetchOecdPrimary(code, fx[code]);
    trees.push(t);
    yearsByCountry[code] = t.year;
    periodByCountry[code] = String(t.year);
    sourceByCountry[code] = "oecd";
    console.log(`  ${t.name}: $${(t.amountMillions / 1000).toFixed(1)}B · ${t.year}`);
  }

  ({ rates: fx, fxYears } = await fetchFx(yearsByCountry));

  console.log("Fetching population / age structure (World Bank)…");
  const popByCode = await fetchPopulationBundle(ALL_ISO3);

  console.log("Fetching 10-year bond yields (OECD IRLT)…");
  const yieldByCode = await fetchBondYieldsBundle(ALL_ISO3);

  const withDemo = trees.map((t) => {
    const pop = popByCode[t.code];
    const yld = yieldByCode[t.code];
    if (!pop) throw new Error(`Missing population for ${t.code}`);
    const out = attachDemographics(t, pop, yld);
    const yStr = yld
      ? ` · 10y ${yld.bondYield10y}% (${yld.bondYield10yPeriod})`
      : " · 10y n/a";
    console.log(
      `  ${t.code} pop=${(pop.population / 1e6).toFixed(1)}M · GDP/cap $${out.gdpPerCapitaUsd.toLocaleString()} · 0–14 ${pop.pctUnder18Proxy}% · 65+ ${pop.pct65Plus}%${yStr}`,
    );
    return out;
  });

  withDemo.sort((a, b) => b.amountMillions - a.amountMillions);

  const maxYear = Math.max(...withDemo.map((t) => t.year));
  const world = {
    id: "world",
    name: "Selected economies",
    amountMillions: round1(withDemo.reduce((s, t) => s + t.amountMillions, 0)),
    color: "#1f3d4d",
    description:
      "Combined industry GDP / value added for the largest selected economies in USD. Each country uses its official national source when available; OECD fills gaps.",
    sources: [
      { label: "BEA GDP by Industry (via FRED)", url: "https://fred.stlouisfed.org/release?rid=331" },
      { label: "Statistics Canada Table 36-10-0434", url: "https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=3610043401" },
      { label: "ABS National Accounts GDP(P)", url: "https://data.api.abs.gov.au/rest/data/ABS,ANA_IND_GVA,1.0.0" },
      { label: "Eurostat nama_10_a10 / nama_10_a64", url: "https://ec.europa.eu/eurostat/databrowser/view/nama_10_a10/default/table" },
      { label: "World Bank WDI sector value added", url: "https://data.worldbank.org/indicator/NV.IND.TOTL.CD" },
      { label: "OECD Table 6 (via DBnomics)", url: "https://db.nomics.world/OECD/DSD_NAMAIN10@DF_TABLE6" },
      { label: "World Bank PA.NUS.FCRF", url: "https://data.worldbank.org/indicator/PA.NUS.FCRF" },
      { label: "World Bank population & age structure", url: "https://data.worldbank.org/indicator/SP.POP.TOTL" },
      { label: "OECD long-term interest rates (IRLT)", url: "https://db.nomics.world/OECD/DSD_KEI@DF_KEI" },
    ],
    year: maxYear,
    periodLabel: String(maxYear),
    children: withDemo,
  };

  const oecdCountries = withDemo
    .filter((t) => t.sourceKey === "oecd")
    .map((t) => t.code);

  const meta = {
    fetchedAt: new Date().toISOString(),
    yearsByCountry,
    periodByCountry,
    fxYears,
    maxYear,
    oecdFallbackUsed: usedFallback,
    sourceByCountry,
    notes: {
      under18:
        "Under-18 uses World Bank SP.POP.0014.TO.ZS (ages 0–14) — closest freely published cohort to under 18.",
      ranking:
        "Batch 4 closes the IMF 2024 top-45 set (Taiwan omitted — no industry series in WB/OECD feeds). Nigeria kept as an African regional anchor.",
      batch2Sources:
        "Eurostat for ES/NL; OECD Table 6 for MEX/TUR/CHE; World Bank sector VA for RUS/BRA/KOR/IDN/SAU.",
      batch3Sources:
        "Eurostat for PL/BE/IE/SE/NO/AT; World Bank sector VA for ARG/THA/ARE/SGP/NGA/ZAF/ISR/EGY/VNM/BGD.",
      batch4Sources:
        "Eurostat for DK/RO/CZ; World Bank sector VA for PHL/MYS/COL/IRN/HKG/PAK.",
      bondYield10y:
        "OECD KEI measure IRLT — long-term interest rates on government bonds with residual maturity of about 10 years (% per annum). Omitted when missing or older than 2022.",
    },
    sources: {
      bea: {
        dataset: "BEA GDP by Industry via FRED release 331",
        countries: ["USA"],
        url: "https://fred.stlouisfed.org/release?rid=331",
        measure: "Value added / GDP by industry, current $, SAAR",
      },
      statcan: {
        dataset: "Statistics Canada 36-10-0434",
        countries: ["CAN"],
        url: "https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=3610043401",
        measure: "GDP at basic prices, SAAR, chained 2017 dollars; latest month",
      },
      abs: {
        dataset: "ABS ANA_IND_GVA (GDP(P))",
        countries: ["AUS"],
        url: "https://data.api.abs.gov.au/rest/data/ABS,ANA_IND_GVA,1.0.0",
        measure: "GVA chain volume, quarterly SA annualized (×4)",
      },
      eurostat: {
        dataset: "Eurostat nama_10_a10 / nama_10_a64",
        countries: ["DEU", "FRA", "ITA", "ESP", "NLD", "POL", "BEL", "IRL", "SWE", "NOR", "AUT", "DNK", "ROU", "CZE"],
        url: "https://ec.europa.eu/eurostat/databrowser/view/nama_10_a10/default/table",
        measure: "Gross value added (B1G), current prices, annual",
      },
      worldbank: {
        dataset: "World Bank WDI sector value added",
        countries: WB_INDUSTRY_CODES,
        url: "https://data.worldbank.org/indicator/NV.IND.TOTL.CD",
        measure: "GDP + agriculture / industry / manufacturing / services VA (USD)",
      },
      oecd: {
        dataset: "OECD/DSD_NAMAIN10@DF_TABLE6",
        countries: oecdCountries,
        url: "https://db.nomics.world/OECD/DSD_NAMAIN10@DF_TABLE6",
        measure: "Primary for JPN/GBR/MEX/TUR/CHE; fallback elsewhere — GVA current prices, annual",
      },
      population: {
        dataset: "World Bank WDI SP.POP.TOTL / 0014 / 65UP",
        countries: ALL_ISO3,
        url: "https://data.worldbank.org/indicator/SP.POP.TOTL",
        measure: "Total population; % ages 0–14; % ages 65+",
      },
      bondYields: {
        dataset: "OECD/DSD_KEI@DF_KEI measure IRLT",
        countries: ALL_ISO3,
        url: "https://db.nomics.world/OECD/DSD_KEI@DF_KEI",
        measure: "Long-term interest rates (~10-year government bonds), % per annum, monthly; omitted if missing/stale",
      },
    },
  };

  writeFileSync(join(ROOT, "src", "data", "countries.ts"), toTsModule(world, withDemo, meta), "utf8");
  writeFileSync(
    join(ROOT, "src", "data", "countries.snapshot.json"),
    JSON.stringify({ meta, world, countries: withDemo }, null, 2),
    "utf8",
  );
  console.log("Wrote src/data/countries.ts");
  if (usedFallback.length) {
    console.warn("OECD fallback used for:", usedFallback.join(", "));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
