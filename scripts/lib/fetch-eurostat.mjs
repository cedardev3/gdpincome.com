/**
 * Eurostat nama_10_a10 + nama_10_a64 — GVA by industry (CP million EUR).
 * Official EU statistics for DE, FR, IT (and other EU geos).
 */

import { cachedFetchJson } from "./http-cache.mjs";

const A10_URL =
  "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/nama_10_a10";
const A64_URL =
  "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/nama_10_a64";

/** Mutually exclusive A*10 sectors (C is nested under B-E via a64). */
const A10_SECTORS = [
  { code: "A", name: "Agriculture, forestry and fishing", color: "#5a8f3c" },
  { code: "B-E", name: "Industry (except construction)", color: "#2a6f97", children: ["B", "C", "D", "E"] },
  { code: "F", name: "Construction", color: "#c45c26" },
  {
    code: "G-I",
    name: "Trade, transport, accommodation and food",
    color: "#2f7d6d",
    children: ["G", "H", "I"],
  },
  { code: "J", name: "Information and communication", color: "#3c6ea8" },
  { code: "K", name: "Financial and insurance activities", color: "#6b5c9a" },
  { code: "L", name: "Real estate activities", color: "#8a7358" },
  {
    code: "M_N",
    name: "Professional, scientific, technical; admin support",
    color: "#2a8f97",
    children: ["M", "N"],
  },
  {
    code: "O-Q",
    name: "Public admin, defence, education, health",
    color: "#9a5c7a",
    children: ["O", "P", "Q"],
  },
  {
    code: "R-U",
    name: "Arts, other services, households",
    color: "#c47a3c",
    children: ["R", "S", "T", "U"],
  },
];

const GEO_META = {
  DE: { id: "deu", code: "DEU", name: "Germany", color: "#1f3d4d" },
  FR: { id: "fra", code: "FRA", name: "France", color: "#2a6f97" },
  IT: { id: "ita", code: "ITA", name: "Italy", color: "#2f7d6d" },
  ES: { id: "esp", code: "ESP", name: "Spain", color: "#c45c26" },
  NL: { id: "nld", code: "NLD", name: "Netherlands", color: "#3d8a7a" },
  PL: { id: "pol", code: "POL", name: "Poland", color: "#8a3c3c" },
  BE: { id: "bel", code: "BEL", name: "Belgium", color: "#5c6b9a" },
  IE: { id: "irl", code: "IRL", name: "Ireland", color: "#2f7d3c" },
  SE: { id: "swe", code: "SWE", name: "Sweden", color: "#3c6ea8" },
  NO: { id: "nor", code: "NOR", name: "Norway", color: "#1f3d4d" },
  AT: { id: "aut", code: "AUT", name: "Austria", color: "#8a5a3c" },
};

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
function shortenName(name) {
  let n = name;
  if (n.length > 52) n = n.slice(0, 49) + "…";
  return n;
}

function decodeEurostat(j, filters) {
  const dims = j.id;
  const sizes = j.size;
  const coords = [];
  for (const d of dims) {
    const labels = Object.keys(j.dimension[d].category.label);
    const key = filters[d];
    const pos = labels.indexOf(key);
    if (pos < 0) return null;
    coords.push(pos);
  }
  let idx = 0;
  let mult = 1;
  for (let d = coords.length - 1; d >= 0; d--) {
    idx += coords[d] * mult;
    mult *= sizes[d];
  }
  const v = j.value[String(idx)];
  return v == null ? null : Number(v);
}

async function fetchJson(url) {
  return cachedFetchJson(url, {
    headers: { "User-Agent": "gdpincome.com/0.1", Accept: "application/json" },
  });
}

/**
 * @param {string[]} geos Eurostat geo codes e.g. ['DE','FR','IT']
 * @param {number} eurPerUsd LCU per USD (EUR per USD)
 */
export async function fetchEurostatCountries(geos, eurPerUsd) {
  const geoQ = geos.map((g) => `geo=${g}`).join("&");
  const a10 = await fetchJson(
    `${A10_URL}?format=JSON&lang=en&${geoQ}&na_item=B1G&unit=CP_MEUR&freq=A&sinceTimePeriod=2018`,
  );
  const a64 = await fetchJson(
    `${A64_URL}?format=JSON&lang=en&${geoQ}&na_item=B1G&unit=CP_MEUR&freq=A&sinceTimePeriod=2018`,
  );

  const source = {
    label: "Eurostat nama_10_a10 / nama_10_a64",
    url: "https://ec.europa.eu/eurostat/databrowser/view/nama_10_a10/default/table",
  };
  const fxSource = {
    label: "World Bank PA.NUS.FCRF (LCU per USD)",
    url: "https://data.worldbank.org/indicator/PA.NUS.FCRF",
  };

  const times = Object.keys(a10.dimension.time.category.label).sort();
  const trees = [];

  for (const geo of geos) {
    const meta = GEO_META[geo];
    if (!meta) throw new Error(`No GEO_META for ${geo}`);

    let year = null;
    let totalMeur = null;
    for (const t of [...times].reverse()) {
      const v = decodeEurostat(a10, {
        freq: "A",
        unit: "CP_MEUR",
        nace_r2: "TOTAL",
        na_item: "B1G",
        geo,
        time: t,
      });
      if (v != null && v > 0) {
        year = Number(t);
        totalMeur = v;
        break;
      }
    }
    if (year == null) throw new Error(`Eurostat: no TOTAL for ${geo}`);

    const toUsd = (meur) => meur / eurPerUsd;

    const a64Labels = a64.dimension.nace_r2.category.label;
    const sections = [];
    for (const sector of A10_SECTORS) {
      const meur = decodeEurostat(a10, {
        freq: "A",
        unit: "CP_MEUR",
        nace_r2: sector.code,
        na_item: "B1G",
        geo,
        time: String(year),
      });
      if (meur == null || meur <= 0) continue;
      const usd = toUsd(meur);
      const children = [];
      let childSum = 0;
      (sector.children ?? []).forEach((code, i) => {
        const childMeur = decodeEurostat(a64, {
          freq: "A",
          unit: "CP_MEUR",
          nace_r2: code,
          na_item: "B1G",
          geo,
          time: String(year),
        });
        if (childMeur == null || childMeur <= 0) return;
        childSum += toUsd(childMeur);
        children.push({
          id: `${meta.id}-${code.toLowerCase()}`,
          name: shortenName(a64Labels[code] || code),
          code,
          amountMillions: round1(toUsd(childMeur)),
          color: shade(sector.color, 0.72 + (i % 5) * 0.06),
          description: `NACE ${code}. Eurostat gross value added, current prices (${year}).`,
          sources: [source, fxSource],
          year,
          periodLabel: String(year),
        });
      });
      const residual = usd - childSum;
      if (children.length > 0 && residual > usd * 0.005) {
        children.push({
          id: `${meta.id}-${sector.code.toLowerCase()}-other`,
          name: "Other / not detailed",
          code: `${sector.code}_RES`,
          amountMillions: round1(residual),
          color: shade(sector.color, 0.55),
          description: `Residual of ${sector.name} (${year}).`,
          sources: [source, fxSource],
          year,
          periodLabel: String(year),
        });
      }
      sections.push({
        id: `${meta.id}-${sector.code.toLowerCase().replace(/[^a-z0-9]+/gi, "-")}`,
        name: shortenName(sector.name),
        code: sector.code,
        amountMillions: round1(usd),
        color: sector.color,
        description: `NACE ${sector.code}. Eurostat gross value added, current prices (${year}).`,
        sources: [source, fxSource],
        year,
        periodLabel: String(year),
        ...(children.length > 0 ? { children } : {}),
      });
    }

    trees.push({
      id: meta.id,
      name: meta.name,
      code: meta.code,
      amountMillions: round1(toUsd(totalMeur)),
      color: meta.color,
      description: `Eurostat gross value added (B1G), current prices, ${year}. Converted from EUR at ${eurPerUsd.toFixed(4)} EUR/USD.`,
      sources: [source, fxSource],
      year,
      periodLabel: String(year),
      currency: "EUR",
      fxLcuPerUsd: eurPerUsd,
      sourceKey: "eurostat",
      children: sections,
    });
  }

  return trees;
}
