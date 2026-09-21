/**
 * USA GDP by industry via FRED (BEA Gross Domestic Product by Industry release).
 * Levels = industry share of GDP × VAAI (billions SAAR) → USD millions.
 * No API key required (public FRED CSV).
 */

const FRED_CSV = (id) =>
  `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}`;

/** Top-level industries + optional subsectors (share-of-GDP series). */
export const USA_INDUSTRY_TREE = [
  {
    code: "AFH",
    series: "VAPGDPAFH",
    name: "Agriculture, forestry, fishing, and hunting",
    color: "#5a8f3c",
  },
  { code: "MIN", series: "VAPGDPM", name: "Mining", color: "#8a6b3c" },
  { code: "UTL", series: "VAPGDPU", name: "Utilities", color: "#d4a017" },
  { code: "CON", series: "VAPGDPC", name: "Construction", color: "#c45c26" },
  {
    code: "MFG",
    series: "VAPGDPMA",
    name: "Manufacturing",
    color: "#2a6f97",
    children: [
      { code: "MFG-D", series: "VAPGDPMD", name: "Durable goods" },
      { code: "MFG-N", series: "VAPGDPMN", name: "Nondurable goods" },
    ],
  },
  { code: "WHL", series: "VAPGDPW", name: "Wholesale trade", color: "#2f7d6d" },
  { code: "RTL", series: "VAPGDPR", name: "Retail trade", color: "#3d8a7a" },
  {
    code: "TW",
    series: "VAPGDPT",
    name: "Transportation and warehousing",
    color: "#5c6b9a",
  },
  { code: "INF", series: "VAPGDPI", name: "Information", color: "#3c6ea8" },
  {
    code: "FIRL",
    series: "VAPGDPFIRL",
    name: "Finance, insurance, real estate, rental, and leasing",
    color: "#6b5c9a",
    children: [
      { code: "FI", series: "VAPGDPFI", name: "Finance and insurance" },
      {
        code: "RL",
        series: "VAPGDPRL",
        name: "Real estate and rental and leasing",
      },
    ],
  },
  {
    code: "PBS",
    series: "VAPGDPPBS",
    name: "Professional and business services",
    color: "#2a8f97",
    children: [
      {
        code: "PST",
        series: "VAPGDPPST",
        name: "Professional, scientific, and technical services",
      },
      {
        code: "MCE",
        series: "VAPGDPMCE",
        name: "Management of companies and enterprises",
      },
      {
        code: "AWMS",
        series: "VAPGDPAWMS",
        name: "Administrative and waste management services",
      },
    ],
  },
  {
    code: "ESHS",
    series: "VAPGDPESHS",
    name: "Educational services, health care, and social assistance",
    color: "#9a5c7a",
    children: [
      { code: "ES", series: "VAPGDPES", name: "Educational services" },
      {
        code: "HCSA",
        series: "VAPGDPHCSA",
        name: "Health care and social assistance",
      },
    ],
  },
  {
    code: "AERAF",
    series: "VAPGDPAERAF",
    name: "Arts, entertainment, recreation, accommodation, and food services",
    color: "#c47a3c",
    children: [
      {
        code: "AER",
        series: "VAPGDPAER",
        name: "Arts, entertainment, and recreation",
      },
      {
        code: "AF",
        series: "VAPGDPAF",
        name: "Accommodation and food services",
      },
    ],
  },
  {
    code: "OSEG",
    series: "VAPGDPOSEG",
    name: "Other services, except government",
    color: "#6a7a8a",
  },
  {
    code: "GOV",
    series: "VAPGDPG",
    name: "Government",
    color: "#1f3d4d",
    children: [
      { code: "FED", series: "VAPGDPF", name: "Federal" },
      { code: "SL", series: "VAPGDPSL", name: "State and local" },
    ],
  },
];

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

async function fetchFredSeries(seriesId) {
  const res = await fetch(FRED_CSV(seriesId), {
    headers: { "User-Agent": "gdpincome.com/0.1" },
  });
  if (!res.ok) throw new Error(`FRED ${seriesId}: HTTP ${res.status}`);
  const text = await res.text();
  if (!text.startsWith("observation_date")) {
    throw new Error(`FRED ${seriesId}: unexpected response`);
  }
  const points = [];
  for (const line of text.trim().split(/\r?\n/).slice(1)) {
    const [date, raw] = line.split(",");
    if (!date || raw === "" || raw == null) continue;
    const value = Number(raw);
    if (Number.isNaN(value)) continue;
    points.push({ date, value });
  }
  if (!points.length) throw new Error(`FRED ${seriesId}: no observations`);
  return points;
}

function formatPeriodLabel(date) {
  const d = new Date(date + "T00:00:00Z");
  const q = Math.floor(d.getUTCMonth() / 3) + 1;
  return `Q${q} ${d.getUTCFullYear()}`;
}

/**
 * @returns {Promise<object>} CountryGdpTree for USA
 */
export async function fetchUsaFromFred() {
  const source = {
    label: "BEA GDP by Industry (via FRED)",
    url: "https://fred.stlouisfed.org/release?rid=331",
  };

  const seriesIds = [
    "VAAI",
    ...USA_INDUSTRY_TREE.flatMap((s) => [
      s.series,
      ...(s.children?.map((c) => c.series) ?? []),
    ]),
  ];

  const byId = new Map();
  for (const id of seriesIds) {
    byId.set(id, await fetchFredSeries(id));
  }

  const totalPts = byId.get("VAAI");
  const latestDate = totalPts.at(-1).date;
  const totalBillions = totalPts.at(-1).value;
  const totalMillions = totalBillions * 1000;
  const year = Number(latestDate.slice(0, 4));
  const periodLabel = formatPeriodLabel(latestDate);

  function valueOnDate(seriesId) {
    const pts = byId.get(seriesId);
    const hit = pts.find((p) => p.date === latestDate) ?? pts.at(-1);
    if (!hit) throw new Error(`FRED ${seriesId}: missing ${latestDate}`);
    return hit.value;
  }

  function millionsFromShare(sharePct) {
    return (sharePct / 100) * totalMillions;
  }

  const sections = USA_INDUSTRY_TREE.map((sector, si) => {
    const share = valueOnDate(sector.series);
    const usd = millionsFromShare(share);
    const children = [];
    let childSum = 0;
    (sector.children ?? []).forEach((child, i) => {
      const childShare = valueOnDate(child.series);
      const childUsd = millionsFromShare(childShare);
      childSum += childUsd;
      children.push({
        id: `usa-${child.code.toLowerCase()}`,
        name: shortenName(child.name),
        code: child.code,
        amountMillions: round1(childUsd),
        color: shade(sector.color, 0.72 + (i % 5) * 0.06),
        description: `BEA value added, ${periodLabel}, seasonally adjusted annual rate (share of GDP × GDP).`,
        sources: [source],
        year,
        periodLabel,
      });
    });

    const residual = usd - childSum;
    if (children.length > 0 && residual > usd * 0.005) {
      children.push({
        id: `usa-${sector.code.toLowerCase()}-other`,
        name: "Other / not detailed",
        code: `${sector.code}_RES`,
        amountMillions: round1(residual),
        color: shade(sector.color, 0.55),
        description: `Residual within ${sector.name} after published subsectors (${periodLabel}).`,
        sources: [source],
        year,
        periodLabel,
      });
    }

    return {
      id: `usa-${sector.code.toLowerCase()}`,
      name: shortenName(sector.name),
      code: sector.code,
      amountMillions: round1(usd),
      color: sector.color,
      description: `BEA value added by industry, ${periodLabel}, SAAR current dollars.`,
      sources: [source],
      year,
      periodLabel,
      ...(children.length > 0 ? { children } : {}),
    };
  }).filter((s) => s.amountMillions > 0);

  return {
    id: "usa",
    name: "United States",
    code: "USA",
    amountMillions: round1(totalMillions),
    color: "#2a6f97",
    description: `BEA value added / GDP by industry as of ${periodLabel}, seasonally adjusted annual rate, current dollars (FRED series VAAI and industry shares).`,
    sources: [source],
    year,
    periodLabel,
    currency: "USD",
    fxLcuPerUsd: 1,
    sourceKey: "bea",
    children: sections,
  };
}
