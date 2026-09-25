/**
 * USA GDP by industry from BEA's published Value Added by Industry table
 * (current dollars, seasonally adjusted at annual rates).
 *
 * FRED release 331 only carries the summary industries. The same published
 * quarterly table on BEA includes one finer group under those summaries.
 * This fetch uses that table and adds only that next group.
 */

import { cachedFetchJson } from "./http-cache.mjs";

const BEA_STEPS = "https://apps.bea.gov/iTable/core/data/app/GetSteps";
const BEA_SOURCE = {
  label: "BEA GDP by Industry",
  url: "https://apps.bea.gov/iTable/?reqid=1603&step=2&Categories=GDPxInd&isURI=1",
};

/** Published summary industries. Children are the groups already on the chart. */
export const USA_INDUSTRY_TREE = [
  {
    code: "AFH",
    name: "Agriculture, forestry, fishing, and hunting",
    color: "#5a8f3c",
  },
  { code: "MIN", name: "Mining", color: "#8a6b3c" },
  { code: "UTL", name: "Utilities", color: "#d4a017" },
  { code: "CON", name: "Construction", color: "#c45c26" },
  {
    code: "MFG",
    name: "Manufacturing",
    color: "#2a6f97",
    children: [
      { code: "MFG-D", name: "Durable goods" },
      { code: "MFG-N", name: "Nondurable goods" },
    ],
  },
  { code: "WHL", name: "Wholesale trade", color: "#2f7d6d" },
  { code: "RTL", name: "Retail trade", color: "#3d8a7a" },
  {
    code: "TW",
    name: "Transportation and warehousing",
    color: "#5c6b9a",
  },
  { code: "INF", name: "Information", color: "#3c6ea8" },
  {
    code: "FIRL",
    name: "Finance, insurance, real estate, rental, and leasing",
    color: "#6b5c9a",
    children: [
      { code: "FI", name: "Finance and insurance" },
      { code: "RL", name: "Real estate and rental and leasing" },
    ],
  },
  {
    code: "PBS",
    name: "Professional and business services",
    color: "#2a8f97",
    children: [
      {
        code: "PST",
        name: "Professional, scientific, and technical services",
      },
      {
        code: "MCE",
        name: "Management of companies and enterprises",
      },
      {
        code: "AWMS",
        name: "Administrative and waste management services",
      },
    ],
  },
  {
    code: "ESHS",
    name: "Educational services, health care, and social assistance",
    color: "#9a5c7a",
    children: [
      { code: "ES", name: "Educational services" },
      { code: "HCSA", name: "Health care and social assistance" },
    ],
  },
  {
    code: "AERAF",
    name: "Arts, entertainment, recreation, accommodation, and food services",
    color: "#c47a3c",
    children: [
      { code: "AER", name: "Arts, entertainment, and recreation" },
      { code: "AF", name: "Accommodation and food services" },
    ],
  },
  {
    code: "OSEG",
    name: "Other services, except government",
    color: "#6a7a8a",
  },
  {
    code: "GOV",
    name: "Government",
    color: "#1f3d4d",
    children: [
      { code: "FED", name: "Federal" },
      { code: "SL", name: "State and local" },
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

function slug(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function parseBillions(raw) {
  const s = String(raw ?? "").replace(/,/g, "").trim();
  if (s === "" || s === "---") return null;
  const n = Number(s);
  if (!Number.isFinite(n)) {
    throw new Error(`BEA value added: unreadable amount "${raw}"`);
  }
  return n;
}

function stripHtml(value) {
  return String(value ?? "").replace(/<[^>]+>/g, "").trim();
}

async function fetchBeaValueAdded() {
  const body = JSON.stringify({
    appid: 1603,
    steps: [4],
    data: [
      ["Categories", "GDPxInd"],
      ["Table_List", "TVA105"],
    ],
  });
  const payload = await cachedFetchJson(BEA_STEPS, {
    method: "POST",
    headers: {
      "User-Agent": "gdpincome.com/0.1",
      "Content-Type": "application/json",
    },
    body,
  });
  const prompt = payload?.Steps?.[0]?.Prompts?.find((p) => p.Name === "TheTable");
  if (!prompt?.PromtData) throw new Error("BEA value added: table missing");
  let table = JSON.parse(prompt.PromtData).Table;
  if (typeof table === "string") table = JSON.parse(table);
  const subtitle = String(table.Sub_Title ?? "");
  if (
    !/billions of dollars/i.test(subtitle) ||
    !/seasonally adjusted at annual rates/i.test(subtitle)
  ) {
    throw new Error(`BEA value added: unexpected units (${subtitle})`);
  }

  const years = table.Data_Rows[0];
  const quarters = table.Data_Rows[1];
  let col = -1;
  for (let i = 2; i < years.length; i++) {
    const year = stripHtml(years[i].CV);
    const quarter = stripHtml(quarters[i].CV);
    if (/^\d{4}$/.test(year) && /^Q[1-4]$/.test(quarter)) col = i;
  }
  if (col < 0) throw new Error("BEA value added: no quarterly column");
  const year = Number(stripHtml(years[col].CV));
  const periodLabel = `${stripHtml(quarters[col].CV)} ${year}`;

  const roots = [];
  const stack = [];
  for (const row of table.Data_Rows.slice(2)) {
    const name = stripHtml(row[1]?.CV);
    if (!name || name.startsWith("Addenda")) break;
    const indent = Number(row[1].IL);
    const billions = parseBillions(row[col].CV);
    if (billions == null) {
      throw new Error(`BEA value added: missing ${name} for ${periodLabel}`);
    }
    const node = { name, billions, indent, children: [] };
    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
    if (!stack.length) roots.push(node);
    else stack[stack.length - 1].children.push(node);
    stack.push(node);
  }

  return { year, periodLabel, roots };
}

function requireNamed(nodes, name) {
  const hit = nodes.find((node) => node.name === name);
  if (!hit) throw new Error(`BEA value added: missing "${name}"`);
  return hit;
}

function toChartNode({ id, code, name, billions, color, year, periodLabel, children }) {
  return {
    id,
    name,
    code,
    amountMillions: round1(billions * 1000),
    color,
    description: `BEA value added by industry, ${periodLabel}, SAAR current dollars.`,
    sources: [BEA_SOURCE],
    year,
    periodLabel,
    ...(children?.length ? { children } : {}),
  };
}

/**
 * @returns {Promise<object>} CountryGdpTree for USA
 */
export async function fetchUsaFromFred() {
  const { year, periodLabel, roots } = await fetchBeaValueAdded();
  const gdp = requireNamed(roots, "Gross domestic product");
  const privateIndustries = requireNamed(roots, "Private industries");
  const government = requireNamed(roots, "Government");

  const sections = USA_INDUSTRY_TREE.map((sector) => {
    const bea =
      sector.name === "Government"
        ? government
        : requireNamed(privateIndustries.children, sector.name);
    return buildNode(sector, bea, sector.color, sector.color, year, periodLabel);
  }).filter((section) => section.amountMillions > 0);

  return {
    id: "usa",
    name: "United States",
    code: "USA",
    amountMillions: round1(gdp.billions * 1000),
    color: "#2a6f97",
    description: `BEA value added / GDP by industry as of ${periodLabel}, seasonally adjusted annual rate, current dollars.`,
    sources: [BEA_SOURCE],
    year,
    periodLabel,
    currency: "USD",
    fxLcuPerUsd: 1,
    sourceKey: "bea",
    children: sections,
  };
}

function buildNode(spec, bea, color, sectorColor, year, periodLabel) {
  const childSpecs = spec.children?.length
    ? spec.children.map((child) => {
        const match = requireNamed(bea.children, child.name);
        return { spec: child, bea: match, stop: false };
      })
    : bea.children.map((child) => ({
        spec: { code: `${spec.code}-${slug(child.name)}`, name: child.name },
        bea: child,
        stop: true,
      }));

  if (childSpecs.length) {
    const sum = childSpecs.reduce((total, child) => total + child.bea.billions, 0);
    const gap = Math.abs(sum - bea.billions);
    if (gap > 0.25) {
      throw new Error(
        `BEA value added: ${bea.name} children sum to ${sum.toFixed(1)} vs parent ${bea.billions}`,
      );
    }
  }

  const children = childSpecs.map((child, i) =>
    buildNode(
      child.stop ? { ...child.spec, children: [] } : child.spec,
      child.stop ? { ...child.bea, children: [] } : child.bea,
      shade(sectorColor, 0.72 + (i % 5) * 0.06),
      sectorColor,
      year,
      periodLabel,
    ),
  );

  return toChartNode({
    id: `usa-${spec.code.toLowerCase()}`,
    code: spec.code,
    name: spec.name,
    billions: bea.billions,
    color,
    year,
    periodLabel,
    children,
  });
}
