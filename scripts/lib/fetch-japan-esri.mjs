/**
 * Japan GDP by economic activity from the Cabinet Office annual National Accounts.
 * Table 3 is current-price calendar-year GDP. Published child rows are one group
 * under the industry, in the same billion-yen series.
 */

import { inflateRawSync } from "node:zlib";
import { cachedFetchBytes } from "./http-cache.mjs";

const TABLE_URL =
  "https://www.esri.cao.go.jp/en/sna/data/kakuhou/files/2024/tables/2024fcm3n_en.xlsx";
const SOURCE = {
  label: "Cabinet Office ESRI National Accounts",
  url: "https://www.esri.cao.go.jp/en/sna/data/kakuhou/files/2024/2024annual_report_e.html",
};
const FX_SOURCE = {
  label: "World Bank PA.NUS.FCRF (LCU per USD)",
  url: "https://data.worldbank.org/indicator/PA.NUS.FCRF",
};

const SECTOR_COLORS = [
  "#5a8f3c",
  "#8a6b3c",
  "#2a6f97",
  "#d4a017",
  "#c45c26",
  "#2f7d6d",
  "#5c6b9a",
  "#c47a3c",
  "#3c6ea8",
  "#6b5c9a",
  "#8a7358",
  "#2a8f97",
  "#1f3d4d",
  "#4a7a5c",
  "#9a5c7a",
  "#6a7a8a",
];

function unzip(buf) {
  let offset = 0;
  const files = new Map();
  while (offset + 30 < buf.length) {
    if (buf.readUInt32LE(offset) !== 0x04034b50) break;
    const method = buf.readUInt16LE(offset + 8);
    const compressed = buf.readUInt32LE(offset + 18);
    const nameLen = buf.readUInt16LE(offset + 26);
    const extraLen = buf.readUInt16LE(offset + 28);
    const name = buf.slice(offset + 30, offset + 30 + nameLen).toString("utf8");
    const start = offset + 30 + nameLen + extraLen;
    const data = buf.slice(start, start + compressed);
    const raw = method === 0 ? data : inflateRawSync(data);
    files.set(name, raw);
    offset = start + compressed;
  }
  return files;
}

function columnIndex(ref) {
  let n = 0;
  for (const ch of ref.match(/^[A-Z]+/)[0]) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function sharedStrings(xml) {
  const out = [];
  for (const item of xml.match(/<si>[\s\S]*?<\/si>/g) ?? []) {
    out.push(
      [...item.matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map((match) => match[1]).join(""),
    );
  }
  return out;
}

function sheetRows(xml, shared) {
  const rows = [];
  for (const row of xml.match(/<row[\s\S]*?<\/row>/g) ?? []) {
    const cells = [];
    for (const cell of row.match(/<c\b[^>]*>[\s\S]*?<\/c>|<c\b[^/]*\/>/g) ?? []) {
      const ref = cell.match(/r="([A-Z]+\d+)"/)?.[1];
      if (!ref) continue;
      const kind = cell.match(/\bt="([^"]+)"/)?.[1];
      const raw = cell.match(/<v>([^<]*)<\/v>/)?.[1] ?? "";
      cells[columnIndex(ref)] = kind === "s" ? shared[Number(raw)] : raw;
    }
    rows.push(cells);
  }
  return rows;
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

function shade(hex, factor) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.round(((n >> 16) & 255) * factor));
  const g = Math.min(255, Math.round(((n >> 8) & 255) * factor));
  const b = Math.min(255, Math.round((n & 255) * factor));
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

function slug(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function cleanLabel(raw) {
  return String(raw).replace(/\s+/g, " ").trim();
}

function displayName(label) {
  return label
    .replace(/^\d+\.\s+/, "")
    .replace(/^\(\d+\)\s+/, "")
    .replace(/^\(less\)\s+/i, "");
}

async function loadAmountSheet() {
  const buf = await cachedFetchBytes(TABLE_URL, {
    headers: { "User-Agent": "gdpincome.com/0.1" },
  });
  const zip = unzip(buf);
  const shared = sharedStrings(zip.get("xl/sharedStrings.xml").toString("utf8"));
  const sheet = zip.get("xl/worksheets/sheet1.xml")?.toString("utf8");
  if (!sheet) throw new Error("ESRI Japan: amount sheet missing");
  const rows = sheetRows(sheet, shared);
  const header = rows.find((row) => cleanLabel(row[0]) === "Items");
  if (!header) throw new Error("ESRI Japan: year header missing");
  let yearCol = -1;
  let year = 0;
  header.forEach((cell, index) => {
    const value = Number(cleanLabel(cell ?? ""));
    if (/^\d{4}$/.test(cleanLabel(cell ?? "")) && value > year) {
      year = value;
      yearCol = index;
    }
  });
  if (yearCol < 0) throw new Error("ESRI Japan: no year column");
  return { rows, year, yearCol };
}

function billionYen(cell, label) {
  const n = Number(cell);
  if (!Number.isFinite(n)) {
    throw new Error(`ESRI Japan: missing amount for ${label}`);
  }
  return n;
}

/**
 * @param {number} fx LCU per USD
 * @param {number} fxYear Year of that FX rate
 */
export async function fetchJapanFromEsri(fx, fxYear) {
  if (!Number.isFinite(fx) || fx <= 0) throw new Error("ESRI Japan: missing FX");
  const { rows, year, yearCol } = await loadAmountSheet();
  if (year !== fxYear) {
    throw new Error(`ESRI Japan: table year ${year} does not match FX year ${fxYear}`);
  }
  const sectors = [];
  let taxes = null;
  let consumptionTaxes = null;
  let discrepancy = null;
  let gdp = null;

  for (const row of rows) {
    const label = cleanLabel(row[0] ?? "");
    if (!label || label === "Items") continue;
    if (/^3\. Gross Domestic Product/i.test(label)) continue;
    if (/^calendar year$/i.test(label) || /^\(billion yen\)$/i.test(label)) continue;
    if (/^sub-total$/i.test(label)) continue;
    if (/not including statistical discrepancy/i.test(label)) continue;

    const value = billionYen(row[yearCol], label);
    if (/^\d+\.\s+/.test(label)) {
      sectors.push({ label, name: displayName(label), billionYen: value, children: [] });
      continue;
    }
    if (/^\(\d+\)\s+/.test(label)) {
      const parent = sectors.at(-1);
      if (!parent) throw new Error(`ESRI Japan: child without parent (${label})`);
      parent.children.push({ label, name: displayName(label), billionYen: value });
      continue;
    }
    if (/^taxes and duties on imports$/i.test(label)) {
      taxes = { name: displayName(label), billionYen: value };
      continue;
    }
    if (/^\(less\)/i.test(label)) {
      consumptionTaxes = { name: displayName(label), billionYen: -value };
      continue;
    }
    if (/^statistical discrepancy$/i.test(label)) {
      discrepancy = { name: displayName(label), billionYen: value };
      continue;
    }
    if (/^gross domestic product$/i.test(label)) {
      gdp = value;
    }
  }

  if (!gdp || !taxes || !consumptionTaxes || !discrepancy || sectors.length < 10) {
    throw new Error("ESRI Japan: activity table did not parse");
  }

  for (const sector of sectors) {
    if (!sector.children.length) continue;
    const sum = sector.children.reduce((total, child) => total + child.billionYen, 0);
    if (Math.abs(sum - sector.billionYen) > 0.25) {
      throw new Error(
        `ESRI Japan: ${sector.name} children sum to ${sum.toFixed(1)} vs ${sector.billionYen}`,
      );
    }
  }

  const adjustments = [taxes, consumptionTaxes, discrepancy];
  const pieSum =
    sectors.reduce((total, sector) => total + sector.billionYen, 0) +
    adjustments.reduce((total, row) => total + row.billionYen, 0);
  if (Math.abs(pieSum - gdp) > 0.5) {
    throw new Error(`ESRI Japan: industries sum to ${pieSum.toFixed(1)} vs GDP ${gdp}`);
  }

  const toUsdMillions = (billion) => round1((billion * 1000) / fx);
  const sources = [SOURCE, FX_SOURCE];

  function node({ id, code, name, billionYen, color, children }) {
    return {
      id,
      name,
      code,
      amountMillions: toUsdMillions(billionYen),
      color,
      description: `Cabinet Office GDP by economic activity, ${year}, current prices.`,
      sources,
      year,
      periodLabel: String(year),
      ...(children?.length ? { children } : {}),
    };
  }

  const children = sectors.map((sector, index) => {
    const color = SECTOR_COLORS[index % SECTOR_COLORS.length];
    const code = slug(sector.name);
    return node({
      id: `jpn-${code}`,
      code: code.toUpperCase(),
      name: sector.name,
      billionYen: sector.billionYen,
      color,
      children: sector.children.map((child, childIndex) =>
        node({
          id: `jpn-${code}-${slug(child.name)}`,
          code: slug(child.name).toUpperCase(),
          name: child.name,
          billionYen: child.billionYen,
          color: shade(color, 0.72 + (childIndex % 5) * 0.06),
        }),
      ),
    });
  });

  const adjustmentNodes = [
    node({
      id: "jpn-taxes-imports",
      code: "TAX_M",
      name: taxes.name,
      billionYen: taxes.billionYen,
      color: "#b08968",
    }),
    node({
      id: "jpn-consumption-tax-gfcf",
      code: "TAX_C",
      name: consumptionTaxes.name,
      billionYen: consumptionTaxes.billionYen,
      color: "#8a7358",
    }),
    node({
      id: "jpn-statistical-discrepancy",
      code: "SD",
      name: discrepancy.name,
      billionYen: discrepancy.billionYen,
      color: "#9a9a9a",
    }),
  ];

  return {
    id: "jpn",
    name: "Japan",
    code: "JPN",
    amountMillions: toUsdMillions(gdp),
    color: "#8a5a3c",
    description: `Cabinet Office GDP by economic activity for ${year}, current prices; USD from JPY at ${fx.toFixed(4)}.`,
    sources,
    year,
    periodLabel: String(year),
    currency: "JPY",
    fxLcuPerUsd: fx,
    sourceKey: "esri",
    children: [...children, ...adjustmentNodes],
  };
}
