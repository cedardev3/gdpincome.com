/**
 * Probe Eurostat, ONS, and World Bank population/age indicators.
 */
import { writeFileSync } from "node:fs";

async function eurostat() {
  // nama_10_a10: A*10 industries — lighter than a64
  // Dimensions typically: freq.unit.nace_r2.na_item.geo
  const urls = [
    "https://ec.europa.eu/eurostat/api/dissemination/sdmx/2.1/data/NAMA_10_A10/A.CP_MEUR.B1G.?format=JSON&lang=en&lastNObservations=3",
    "https://ec.europa.eu/eurostat/api/dissemination/sdmx/2.1/data/NAMA_10_A10/A.CP_MEUR..DE?format=JSON&lang=en&lastNObservations=1",
  ];
  for (const url of urls) {
    console.log("\nGET", url.slice(0, 120));
    const res = await fetch(url, { headers: { "User-Agent": "gdpincome/0.1", Accept: "application/json" } });
    console.log("status", res.status);
    const text = await res.text();
    console.log(text.slice(0, 400).replace(/\s+/g, " "));
    if (res.ok) writeFileSync("probe-eurostat.json", text.slice(0, 500000));
  }
}

async function wbPop() {
  const countries = "CHN;DEU;JPN;GBR;IND;FRA;RUS;USA;CAN;AUS";
  for (const ind of ["SP.POP.TOTL", "SP.POP.0014.TO.ZS", "SP.POP.65UP.TO.ZS"]) {
    const url = `https://api.worldbank.org/v2/country/${countries}/indicator/${ind}?format=json&date=2020:2025&per_page=100`;
    const j = await (await fetch(url)).json();
    const latest = {};
    for (const r of j[1] || []) {
      if (r.value == null) continue;
      const prev = latest[r.countryiso3code];
      if (!prev || Number(r.date) > Number(prev.date)) latest[r.countryiso3code] = { date: r.date, value: r.value };
    }
    console.log("\n", ind, latest);
  }
}

async function ons() {
  // ONS GDP low-level aggregates
  const url = "https://api.ons.gov.uk/timeseries/ABMI/dataset/qna/data";
  const res = await fetch(url, { headers: { "User-Agent": "gdpincome/0.1" } });
  console.log("\nONS sample", res.status, (await res.text()).slice(0, 200));
}

await eurostat();
await wbPop();
await ons();
