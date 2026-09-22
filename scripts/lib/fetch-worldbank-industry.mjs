/**
 * Broad industry value added via World Bank WDI
 * (compiled from national statistical offices).
 * Two-level: Agriculture / Industry (+ Manufacturing child when available) / Services.
 */

import { cachedFetchJson } from "./http-cache.mjs";

const INDICATORS = {
  gdp: "NY.GDP.MKTP.CD",
  agr: "NV.AGR.TOTL.CD",
  ind: "NV.IND.TOTL.CD",
  mfg: "NV.IND.MANF.CD",
  srv: "NV.SRV.TOTL.CD",
};

const META = {
  CHN: { id: "chn", name: "China", color: "#c45c26" },
  IND: { id: "ind", name: "India", color: "#d4a017" },
  RUS: { id: "rus", name: "Russia", color: "#6b5c9a" },
  BRA: { id: "bra", name: "Brazil", color: "#2f7d6d" },
  KOR: { id: "kor", name: "South Korea", color: "#3c6ea8" },
  IDN: { id: "idn", name: "Indonesia", color: "#8a5a3c" },
  SAU: { id: "sau", name: "Saudi Arabia", color: "#8a7358" },
  ARG: { id: "arg", name: "Argentina", color: "#6a8ab0" },
  THA: { id: "tha", name: "Thailand", color: "#2a6f97" },
  ARE: { id: "are", name: "United Arab Emirates", color: "#2f7d6d" },
  SGP: { id: "sgp", name: "Singapore", color: "#c45c26" },
  NGA: { id: "nga", name: "Nigeria", color: "#5a8f3c" },
  ZAF: { id: "zaf", name: "South Africa", color: "#8a6b3c" },
  ISR: { id: "isr", name: "Israel", color: "#3c6ea8" },
  EGY: { id: "egy", name: "Egypt", color: "#c47a3c" },
  VNM: { id: "vnm", name: "Vietnam", color: "#2f7d3c" },
  BGD: { id: "bgd", name: "Bangladesh", color: "#5c6b9a" },
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

async function fetchIndicator(iso3, indicator) {
  const url = `https://api.worldbank.org/v2/country/${iso3}/indicator/${indicator}?format=json&date=2018:2025&per_page=50`;
  let lastErr;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const j = await cachedFetchJson(url, {
        headers: { "User-Agent": "gdpincome.com/0.1" },
      });
      const rows = (j[1] || []).filter((r) => r.value != null);
      if (!rows.length) return null;
      rows.sort((a, b) => Number(b.date) - Number(a.date));
      return { year: Number(rows[0].date), value: Number(rows[0].value) };
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
    }
  }
  throw lastErr;
}

/**
 * @param {string} iso3
 */
export async function fetchWorldBankIndustry(iso3) {
  const meta = META[iso3];
  if (!meta) throw new Error(`No WB industry meta for ${iso3}`);

  const [gdp, agr, ind, mfg, srv] = await Promise.all([
    fetchIndicator(iso3, INDICATORS.gdp),
    fetchIndicator(iso3, INDICATORS.agr),
    fetchIndicator(iso3, INDICATORS.ind),
    fetchIndicator(iso3, INDICATORS.mfg),
    fetchIndicator(iso3, INDICATORS.srv),
  ]);
  if (!gdp || !agr || !ind || !srv) {
    throw new Error(`World Bank incomplete industry VA for ${iso3}`);
  }

  // Prefer a common year across series (mfg optional)
  const years = [gdp, agr, ind, srv, mfg].filter(Boolean).map((x) => x.year);
  const year = Math.min(...years);
  async function atYear(indicator, optional = false) {
    const url = `https://api.worldbank.org/v2/country/${iso3}/indicator/${indicator}?format=json&date=${year}&per_page=5`;
    const j = await cachedFetchJson(url, { headers: { "User-Agent": "gdpincome.com/0.1" } });
    const row = (j[1] || []).find((r) => r.value != null);
    if (!row) {
      if (optional) return null;
      throw new Error(`${iso3} ${indicator} missing ${year}`);
    }
    return Number(row.value);
  }

  const [gdpY, agrY, indY, mfgY, srvY] = await Promise.all([
    atYear(INDICATORS.gdp),
    atYear(INDICATORS.agr),
    atYear(INDICATORS.ind),
    atYear(INDICATORS.mfg, true),
    atYear(INDICATORS.srv),
  ]);

  const source = {
    label: "World Bank WDI (national accounts)",
    url: "https://data.worldbank.org/indicator/NV.IND.TOTL.CD",
  };

  const toM = (usd) => usd / 1e6;
  const industryChildren = [];
  if (mfgY != null && mfgY > 0) {
    industryChildren.push({
      id: `${meta.id}-mfg`,
      name: "Manufacturing",
      code: "MFG",
      amountMillions: round1(toM(mfgY)),
      color: shade("#2a6f97", 0.8),
      description: `Manufacturing value added, ${year} (World Bank NV.IND.MANF.CD).`,
      sources: [source],
      year,
      periodLabel: String(year),
    });
    const otherInd = indY - mfgY;
    if (otherInd > 0) {
      industryChildren.push({
        id: `${meta.id}-ind-other`,
        name: "Other industry (excl. manufacturing)",
        code: "IND_OTH",
        amountMillions: round1(toM(otherInd)),
        color: shade("#2a6f97", 0.65),
        description: `Industry minus manufacturing, ${year}.`,
        sources: [source],
        year,
        periodLabel: String(year),
      });
    }
  }

  const sections = [
    {
      id: `${meta.id}-agr`,
      name: "Agriculture, forestry, and fishing",
      code: "AGR",
      amountMillions: round1(toM(agrY)),
      color: "#5a8f3c",
      description: `Agriculture value added, ${year} (World Bank NV.AGR.TOTL.CD).`,
      sources: [source],
      year,
      periodLabel: String(year),
    },
    {
      id: `${meta.id}-ind`,
      name: "Industry",
      code: "IND",
      amountMillions: round1(toM(indY)),
      color: "#2a6f97",
      description: `Industry value added, ${year} (World Bank NV.IND.TOTL.CD).`,
      sources: [source],
      year,
      periodLabel: String(year),
      ...(industryChildren.length > 0 ? { children: industryChildren } : {}),
    },
    {
      id: `${meta.id}-srv`,
      name: "Services",
      code: "SRV",
      amountMillions: round1(toM(srvY)),
      color: "#6b5c9a",
      description: `Services value added, ${year} (World Bank NV.SRV.TOTL.CD).`,
      sources: [source],
      year,
      periodLabel: String(year),
    },
  ];

  return {
    id: meta.id,
    name: meta.name,
    code: iso3,
    amountMillions: round1(toM(gdpY)),
    color: meta.color,
    description: `World Bank GDP and sector value added for ${year} (compiled from national sources). Sector detail is broad (agriculture / industry / services).`,
    sources: [source],
    year,
    periodLabel: String(year),
    currency: "USD",
    fxLcuPerUsd: 1,
    sourceKey: "worldbank",
    children: sections,
  };
}
