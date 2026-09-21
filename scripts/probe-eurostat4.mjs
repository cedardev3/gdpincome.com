async function main() {
  // Eurostat 2025 values for DE FR + a64 sample
  const a10 =
    "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/nama_10_a10?format=JSON&lang=en&geo=DE&geo=FR&geo=IT&geo=GB&na_item=B1G&unit=CP_MEUR&freq=A&sinceTimePeriod=2022";
  const j = await (await fetch(a10, { headers: { "User-Agent": "gdpincome/0.1" } })).json();
  console.log("geos", j.dimension.geo.category.label);
  console.log("times", j.dimension.time.category.label);
  console.log("nace", j.dimension.nace_r2.category.label);

  // Decode TOTAL for each geo latest year
  const dims = j.id;
  const sizes = j.size;
  const dimIndex = Object.fromEntries(dims.map((d, i) => [d, i]));
  function getValue(filters) {
    // filters: {nace_r2:'TOTAL', geo:'DE', time:'2025'}
    const coords = [];
    for (const d of dims) {
      const labels = Object.keys(j.dimension[d].category.label);
      const key = filters[d] ?? labels[0];
      const pos = labels.indexOf(key);
      if (pos < 0) return null;
      coords.push(pos);
    }
    let idx = 0;
    let mult = 1;
    for (let d = coords.length - 1; d >= 0; d--) {
      idx += coords[d] * mult;
      mult *= sizes[d];
    }
    return j.value[String(idx)];
  }
  for (const geo of Object.keys(j.dimension.geo.category.label)) {
    for (const time of ["2025", "2024", "2023"]) {
      const v = getValue({ nace_r2: "TOTAL", geo, time, freq: "A", unit: "CP_MEUR", na_item: "B1G" });
      if (v != null) console.log(geo, time, "TOTAL B1G MEUR", v);
    }
  }

  // OECD China search
  const q = encodeURIComponent("China B1G");
  const url = `https://api.db.nomics.world/v22/series/OECD?q=${q}&limit=10&observations=0`;
  const o = await (await fetch(url, { headers: { "User-Agent": "gdpincome/0.1" } })).json();
  console.log("\nOECD China series", o.series?.num_found);
  for (const d of o.series?.docs || []) {
    console.log(d.dataset_code, d.series_code?.slice(0, 80), d.series_name?.slice(0, 80));
  }

  // World Bank sector VA for CHN IND
  const wb =
    "https://api.worldbank.org/v2/country/CHN;IND/indicator/NV.AGR.TOTL.CD;NV.IND.TOTL.CD;NV.SRV.TOTL.CD;NV.IND.MANF.CD?format=json&date=2023:2025&per_page=100";
  // WB doesn't support multiple indicators that way - do one
  for (const ind of ["NV.AGR.TOTL.CD", "NV.IND.TOTL.CD", "NV.SRV.TOTL.CD", "NV.IND.MANF.CD", "NY.GDP.MKTP.CD"]) {
    const u = `https://api.worldbank.org/v2/country/CHN;IND/indicator/${ind}?format=json&date=2022:2025`;
    const w = await (await fetch(u)).json();
    for (const r of w[1] || []) {
      if (r.value != null) console.log(ind, r.countryiso3code, r.date, (r.value / 1e9).toFixed(1) + "B");
    }
  }
}
main();
