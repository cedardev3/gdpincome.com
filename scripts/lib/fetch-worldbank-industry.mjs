/**
 * China & India broad industry value added via World Bank WDI
 * (compiled from national statistical offices).
 * Two-level: Agriculture / Industry (+ Manufacturing child) / Services.
 */

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
  const j = await (await fetch(url, { headers: { "User-Agent": "gdpincome.com/0.1" } })).json();
  const rows = (j[1] || []).filter((r) => r.value != null);
  if (!rows.length) return null;
  rows.sort((a, b) => Number(b.date) - Number(a.date));
  return { year: Number(rows[0].date), value: Number(rows[0].value) };
}

/**
 * @param {string} iso3 CHN | IND
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

  // Prefer a common year across series
  const years = [gdp, agr, ind, mfg, srv].filter(Boolean).map((x) => x.year);
  const year = Math.min(...years);
  async function atYear(indicator) {
    const url = `https://api.worldbank.org/v2/country/${iso3}/indicator/${indicator}?format=json&date=${year}&per_page=5`;
    const j = await (await fetch(url, { headers: { "User-Agent": "gdpincome.com/0.1" } })).json();
    const row = (j[1] || []).find((r) => r.value != null);
    if (!row) throw new Error(`${iso3} ${indicator} missing ${year}`);
    return Number(row.value);
  }

  const [gdpY, agrY, indY, mfgY, srvY] = await Promise.all([
    atYear(INDICATORS.gdp),
    atYear(INDICATORS.agr),
    atYear(INDICATORS.ind),
    atYear(INDICATORS.mfg),
    atYear(INDICATORS.srv),
  ]);

  const source = {
    label: "World Bank WDI (national accounts)",
    url: "https://data.worldbank.org/indicator/NV.IND.TOTL.CD",
  };

  const toM = (usd) => usd / 1e6;
  const otherInd = indY - mfgY;

  const industryChildren = [
    {
      id: `${meta.id}-mfg`,
      name: "Manufacturing",
      code: "MFG",
      amountMillions: round1(toM(mfgY)),
      color: shade("#2a6f97", 0.8),
      description: `Manufacturing value added, ${year} (World Bank NV.IND.MANF.CD).`,
      sources: [source],
      year,
      periodLabel: String(year),
    },
  ];
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
      children: industryChildren,
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
