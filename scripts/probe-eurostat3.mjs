import { readFileSync, writeFileSync } from "node:fs";

const url =
  "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/nama_10_a10?format=JSON&lang=en&geo=DE&geo=FR&na_item=B1G&unit=CP_MEUR&freq=A&sinceTimePeriod=2018";
const j = await (await fetch(url, { headers: { "User-Agent": "gdpincome/0.1" } })).json();
writeFileSync("probe-eurostat-a10.json", JSON.stringify(j, null, 2));
console.log("keys", Object.keys(j));
console.log("id", j.id);
console.log("dimension", j.dimension ? Object.keys(j.dimension) : null);
console.log("size", j.size);
console.log("id array", j.id);
for (const [k, dim] of Object.entries(j.dimension || {})) {
  const cats = dim.category?.label || {};
  console.log("\nDIM", k, "labels", Object.keys(cats).length);
  console.log([...Object.entries(cats)].slice(0, 25).map(([a, b]) => `${a}=${b}`).join(" | "));
}

// Decode a few values for DE TOTAL latest
const dims = j.id; // order of dimensions
const sizes = j.size;
function indexOf(coords) {
  // coords object dim->position
  let idx = 0;
  let mult = 1;
  for (let d = dims.length - 1; d >= 0; d--) {
    idx += coords[d] * mult;
    mult *= sizes[d];
  }
  return idx;
}
console.log("\nvalue count", Object.keys(j.value).length);
