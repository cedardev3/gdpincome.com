/**
 * Australia industry GVA via ABS Data API — ANA_IND_GVA (GDP(P)).
 * Chain volume measures, quarterly SA levels → ×4 for annualized USD millions.
 */

import { cachedFetchText } from "./http-cache.mjs";

const ABS_URL =
  "https://data.api.abs.gov.au/rest/data/ABS,ANA_IND_GVA,1.0.0/all?startPeriod=2023&format=csvfilewithlabels";

const ABS_SECTOR_COLORS = {
  A: "#5a8f3c",
  B: "#8a6b3c",
  C: "#2a6f97",
  D: "#d4a017",
  E: "#c45c26",
  F: "#2f7d6d",
  G: "#3d8a7a",
  H: "#b85c6e",
  I: "#5c6b9a",
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
};

/** Map of parent industry letter → detail DATA_ITEM codes (exclude parent GPM). */
const ABS_DETAIL_ITEMS = {
  A: ["GPM_AGR", "GPM_FFH"],
  B: ["GPM_COA", "GPM_PET", "GPM_IRO", "GPM_OTHM", "GPM_MIN", "GPM_EMSS"],
  C: ["GPM_FBT", "GPM_PCCR", "GPM_MEP", "GPM_MEQ", "GPM_OMA"],
  D: ["GPM_ELE", "GPM_GAS", "GPM_WSWS"],
  E: ["GPM_BUI", "GPM_HCE", "GPM_SER"],
  I: ["GPM_ROA", "GPM_RAI", "GPM_AST", "GPM_TPSS"],
  J: ["GPM_TEL", "GPM_OIM"],
  K: ["GPM_FIN", "GPM_OFS"],
  L: ["GPM_RHS", "GPM_PRS"],
  M: ["GPM_CSD", "GPM_STS"],
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

function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQ = !inQ;
      continue;
    }
    if (c === "," && !inQ) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += c;
  }
  out.push(cur);
  return out;
}

function formatPeriodLabel(period) {
  // 2026-Q2 → Q2 2026
  const m = String(period).match(/^(\d{4})-Q([1-4])$/i);
  if (!m) return String(period);
  return `Q${m[2]} ${m[1]}`;
}

/**
 * @param {number} fxAudPerUsd
 */
export async function fetchAusFromAbs(fxAudPerUsd) {
  const source = {
    label: "ABS National Accounts — GDP(P) / ANA_IND_GVA",
    url: "https://www.abs.gov.au/statistics/economy/national-accounts",
  };
  const fxSource = {
    label: "World Bank PA.NUS.FCRF (LCU per USD)",
    url: "https://data.worldbank.org/indicator/PA.NUS.FCRF",
  };

  const text = await cachedFetchText(ABS_URL, {
    headers: { "User-Agent": "gdpincome.com/0.1", Accept: "text/csv" },
  });
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) throw new Error("ABS ANA_IND_GVA: empty CSV");

  const header = parseCsvLine(lines[0]);
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));

  /** @type {Map<string, object[]>} */
  const byPeriod = new Map();
  for (const line of lines.slice(1)) {
    const cols = parseCsvLine(line);
    if (cols[idx.MEASURE] !== "VCH") continue;
    if (cols[idx.TSEST] !== "20") continue;
    if (cols[idx.REGION] !== "AUS") continue;
    if (cols[idx.FREQ] !== "Q") continue;
    const period = cols[idx.TIME_PERIOD];
    const val = Number(cols[idx.OBS_VALUE]);
    if (Number.isNaN(val)) continue;
    if (!byPeriod.has(period)) byPeriod.set(period, []);
    byPeriod.get(period).push({
      dataItem: cols[idx.DATA_ITEM],
      dataLabel: cols[idx["Data Item"]],
      industry: cols[idx.INDUSTRY],
      industryLabel: cols[idx.Industry],
      value: val,
    });
  }

  const periods = [...byPeriod.keys()].sort();
  const latest = periods.at(-1);
  if (!latest) throw new Error("ABS: no quarterly periods");
  const rows = byPeriod.get(latest);
  const year = Number(latest.slice(0, 4));
  const periodLabel = formatPeriodLabel(latest);

  // Quarterly SA levels in AUD millions → annualized SAAR-like for comparison
  const annualize = (q) => q * 4;
  const toUsd = (audMillionsQ) => annualize(audMillionsQ) / fxAudPerUsd;

  const gpp = rows.find((r) => r.dataItem === "GPP" && r.industry === "TOTAL");
  if (!gpp) throw new Error(`ABS: missing GPP total for ${latest}`);

  const letterIndustries = "ABCDEFGHIJKLMNOPQRS".split("");
  const sections = [];
  for (const letter of letterIndustries) {
    const row = rows.find((r) => r.dataItem === "GPM" && r.industry === letter);
    if (!row || row.value <= 0) continue;
    const color = ABS_SECTOR_COLORS[letter];
    const usd = toUsd(row.value);
    const detailCodes = ABS_DETAIL_ITEMS[letter] ?? [];
    const children = [];
    let childSum = 0;
    detailCodes.forEach((code, i) => {
      const d = rows.find((r) => r.dataItem === code && r.industry === letter);
      if (!d || d.value <= 0) return;
      const childUsd = toUsd(d.value);
      childSum += childUsd;
      children.push({
        id: `aus-${code.toLowerCase()}`,
        name: shortenName(d.dataLabel.replace(/^Gross value added -\s*/i, "")),
        code,
        amountMillions: round1(childUsd),
        color: shade(color, 0.72 + (i % 5) * 0.06),
        description: `ABS industry detail under ${row.industryLabel}, ${periodLabel}, chain volume measures (quarterly SA × 4, USD).`,
        sources: [source, fxSource],
        year,
        periodLabel,
      });
    });

    const residual = usd - childSum;
    if (children.length > 0 && residual > usd * 0.005) {
      children.push({
        id: `aus-${letter.toLowerCase()}-other`,
        name: "Other / not detailed",
        code: `${letter}_RES`,
        amountMillions: round1(residual),
        color: shade(color, 0.55),
        description: `Residual of ${row.industryLabel} after published detail (${periodLabel}).`,
        sources: [source, fxSource],
        year,
        periodLabel,
      });
    }

    sections.push({
      id: `aus-${letter.toLowerCase()}`,
      name: shortenName(row.industryLabel),
      code: letter,
      amountMillions: round1(usd),
      color,
      description: `ABS gross value added, ${periodLabel}, chain volume measures (quarterly SA × 4).`,
      sources: [source, fxSource],
      year,
      periodLabel,
      ...(children.length > 0 ? { children } : {}),
    });
  }

  return {
    id: "aus",
    name: "Australia",
    code: "AUS",
    amountMillions: round1(toUsd(gpp.value)),
    color: "#2f7d6d",
    description: `ABS GDP(P) / gross value added at basic prices as of ${periodLabel}, chain volume measures, seasonally adjusted quarterly levels annualized (×4) and converted at ${fxAudPerUsd.toFixed(4)} AUD/USD.`,
    sources: [source, fxSource],
    year,
    periodLabel,
    currency: "AUD",
    fxLcuPerUsd: fxAudPerUsd,
    sourceKey: "abs",
    children: sections,
  };
}
