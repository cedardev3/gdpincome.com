import { writeFileSync } from "node:fs";

async function main() {
  // Get DSD for NAMA_10_A10
  const dsdUrl =
    "https://ec.europa.eu/eurostat/api/dissemination/sdmx/2.1/datastructure/ESTAT/NAMA_10_A10/latest?references=children&detail=referencepartial";
  const res = await fetch(dsdUrl, {
    headers: { Accept: "application/vnd.sdmx.structure+json;version=1.0", "User-Agent": "gdpincome/0.1" },
  });
  console.log("DSD status", res.status, res.headers.get("content-type"));
  const text = await res.text();
  writeFileSync("probe-eurostat-dsd.json", text.slice(0, 200000));
  try {
    const j = JSON.parse(text);
    const dsd = j.data?.dataStructures?.[0] || j.data?.datastructures?.[0];
    console.log(JSON.stringify(dsd?.dataStructureComponents?.dimensionList || dsd, null, 2).slice(0, 3000));
  } catch {
    // XML fallback - extract dimension ids
    const dims = [...text.matchAll(/id="([^"]+)"[^>]*>[\s\S]*?Dimension/gi)].slice(0, 20);
    const ids = [...text.matchAll(/<structure:Dimension[^>]*id="([^"]+)"/g)].map((m) => m[1]);
    console.log("xml dims", ids);
    const ids2 = [...text.matchAll(/dimension.*?id="([A-Z0-9_]+)"/gi)].map((m) => m[1]);
    console.log("ids2", [...new Set(ids2)].slice(0, 30));
  }

  // Try common Eurostat JSON-stat endpoint (often easier)
  const jsonStat =
    "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/nama_10_a10?format=JSON&lang=en&geo=DE&geo=FR&geo=IT&na_item=B1G&unit=CP_MEUR&freq=A&sinceTimePeriod=2020";
  const r2 = await fetch(jsonStat, { headers: { "User-Agent": "gdpincome/0.1" } });
  console.log("\njson-stat", r2.status);
  const t2 = await r2.text();
  console.log(t2.slice(0, 600));
  if (r2.ok) writeFileSync("probe-eurostat-a10.json", t2);
}

main();
