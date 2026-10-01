/**
 * Attach IMF debt / interest and World Bank life expectancy onto the existing
 * industry snapshot. Does not refetch industry trees.
 *
 * Run: node scripts/merge-fiscal-life.mjs
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { toTsModule } from "./fetch-gdp.mjs";
import {
  DEBT_SOURCE,
  FISCAL_SOURCE_LABELS,
  GDP_SOURCE,
  INTEREST_SOURCE,
  LIFE_SOURCE,
  attachFiscalLife,
  fetchFiscalLifeBundle,
} from "./lib/fetch-fiscal-life.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const snapshotPath = join(ROOT, "src", "data", "countries.snapshot.json");
const snapshot = JSON.parse(readFileSync(snapshotPath, "utf8"));
const codes = snapshot.countries.map((c) => c.code);

const { byCode, queries } = await fetchFiscalLifeBundle(codes);

console.log("Queries:");
for (const [name, url] of Object.entries(queries)) console.log(`  ${name}: ${url}`);

const usa = byCode.USA;
console.log("USA returned:");
console.log(JSON.stringify(usa, null, 2));

const missingInterest = codes.filter((code) => byCode[code].debtInterestYear == null);
console.log(`Interest series missing (${missingInterest.length}): ${missingInterest.join(", ") || "none"}`);
console.log(`Debt and life expectancy present for ${codes.length} countries`);

const drop = new Set(FISCAL_SOURCE_LABELS);
function withoutFiscalSources(sources) {
  return (sources ?? []).filter((s) => !drop.has(s.label));
}

snapshot.countries = snapshot.countries.map((country) =>
  attachFiscalLife(country, byCode[country.code]),
);
snapshot.world.children = snapshot.world.children.map((country) =>
  attachFiscalLife(country, byCode[country.code]),
);
snapshot.world.sources = [
  ...withoutFiscalSources(snapshot.world.sources),
  DEBT_SOURCE,
  GDP_SOURCE,
  INTEREST_SOURCE,
  LIFE_SOURCE,
];

snapshot.meta.notes = {
  ...snapshot.meta.notes,
  publicDebt:
    "IMF WEO general government gross debt (GGXWDG_NGDP) times IMF nominal GDP (NGDPD) for the same year. Years after 2025 are projections and are omitted. Debt per capita uses IMF GDP per capita (NGDPDPC) for that year.",
  debtInterest:
    "IMF interest paid on public debt, percent of GDP, times IMF GDP per capita of that same year. Omitted when IMF does not publish the interest series. Not the 10-year bond yield.",
  lifeExpectancy:
    "World Bank SP.DYN.LE00.IN, life expectancy at birth. The 5-year change is the latest year minus the observation exactly five years earlier.",
};
snapshot.meta.sources = {
  ...snapshot.meta.sources,
  publicDebt: {
    dataset: "IMF WEO GGXWDG_NGDP × NGDPD",
    countries: codes,
    url: DEBT_SOURCE.url,
    measure: "General government gross debt, current USD, latest year through 2025",
  },
  debtInterest: {
    dataset: "IMF DataMapper ie × NGDPDPC",
    countries: codes.filter((code) => byCode[code].debtInterestYear != null),
    url: INTEREST_SOURCE.url,
    measure: "Interest paid on public debt, percent of GDP, per person using same-year IMF GDP per capita",
  },
  lifeExpectancy: {
    dataset: "World Bank WDI SP.DYN.LE00.IN",
    countries: codes,
    url: LIFE_SOURCE.url,
    measure: "Life expectancy at birth, years, plus the observation five years earlier",
  },
};

writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2), "utf8");
writeFileSync(
  join(ROOT, "src", "data", "countries.ts"),
  toTsModule(snapshot.world, snapshot.countries, snapshot.meta),
  "utf8",
);
console.log("Updated src/data/countries.ts and countries.snapshot.json");
