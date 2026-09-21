/**
 * 10-year government bond yields via OECD Key Economic Indicators (IRLT)
 * through DBnomics — long-term interest rates ≈ residual maturity ~10 years.
 */

const DATASET = "OECD/DSD_KEI@DF_KEI";
const SOURCE = {
  label: "OECD long-term interest rates (IRLT / ~10y govt bonds)",
  url: "https://db.nomics.world/OECD/DSD_KEI@DF_KEI",
};

function round4(n) {
  return Math.round(n * 10000) / 10000;
}

function latestObservation(doc) {
  const periods = doc.period ?? [];
  const values = doc.value ?? [];
  for (let i = periods.length - 1; i >= 0; i--) {
    const v = values[i];
    if (v == null || Number.isNaN(Number(v))) continue;
    return { period: String(periods[i]), value: Number(v) };
  }
  return null;
}

/**
 * @param {string[]} iso3List
 * @returns {Promise<Record<string, object>>}
 */
export async function fetchBondYieldsBundle(iso3List) {
  const dimensions = encodeURIComponent(
    JSON.stringify({
      REF_AREA: iso3List,
      MEASURE: ["IRLT"],
      FREQ: ["M"],
      UNIT_MEASURE: ["PA"],
    }),
  );
  const url = `https://api.db.nomics.world/v22/series/${DATASET}?dimensions=${dimensions}&limit=50&observations=1`;
  const res = await fetch(url, {
    headers: { "User-Agent": "gdpincome.com/0.1", Accept: "application/json" },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OECD IRLT HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  const docs = data.series?.docs ?? [];
  if (!docs.length) throw new Error("OECD IRLT: no series returned");

  const out = {};
  for (const doc of docs) {
    const code = doc.dimensions?.REF_AREA;
    if (!code || !iso3List.includes(code)) continue;
    const latest = latestObservation(doc);
    if (!latest) throw new Error(`OECD IRLT: no observations for ${code}`);
    out[code] = {
      bondYield10y: round4(latest.value),
      bondYield10yPeriod: latest.period,
      bondYield10yUnit: "% p.a.",
      bondYield10yLabel: "10-year government bond yield",
      sources: [SOURCE],
    };
  }

  const missing = iso3List.filter((c) => !out[c]);
  if (missing.length) {
    throw new Error(`OECD IRLT missing countries: ${missing.join(", ")}`);
  }
  return out;
}
