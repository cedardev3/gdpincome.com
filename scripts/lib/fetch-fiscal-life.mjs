/**
 * General-government debt and interest from IMF DataMapper, and life expectancy
 * from World Bank WDI. Debt and interest are paired with IMF nominal GDP of the
 * same year. Years after 2025 are IMF projections and are not used.
 */

import { cachedFetchJson } from "./http-cache.mjs";

/** Last completed calendar year we treat as published, not a projection. */
const MAX_YEAR = 2025;

export const DEBT_SOURCE = {
  label: "IMF WEO general government gross debt (GGXWDG_NGDP)",
  url: "https://www.imf.org/external/datamapper/GGXWDG_NGDP",
};

export const GDP_SOURCE = {
  label: "IMF WEO nominal GDP (NGDPD / NGDPDPC)",
  url: "https://www.imf.org/external/datamapper/NGDPD",
};

export const INTEREST_SOURCE = {
  label: "IMF interest paid on public debt (% of GDP)",
  url: "https://www.imf.org/external/datamapper/ie",
};

export const LIFE_SOURCE = {
  label: "World Bank life expectancy at birth (SP.DYN.LE00.IN)",
  url: "https://data.worldbank.org/indicator/SP.DYN.LE00.IN",
};

export const FISCAL_SOURCE_LABELS = [
  DEBT_SOURCE.label,
  GDP_SOURCE.label,
  INTEREST_SOURCE.label,
  LIFE_SOURCE.label,
];

const IMF_URL = {
  debt: "https://www.imf.org/external/datamapper/api/v1/GGXWDG_NGDP",
  gdp: "https://www.imf.org/external/datamapper/api/v1/NGDPD",
  gdpPerCapita: "https://www.imf.org/external/datamapper/api/v1/NGDPDPC",
  interest: "https://www.imf.org/external/datamapper/api/v1/ie",
};

function round1(n) {
  return Math.round(n * 10) / 10;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function seriesOf(json, indicator) {
  const values = json?.values?.[indicator];
  if (!values || typeof values !== "object") {
    throw new Error(`IMF ${indicator} response has no values`);
  }
  return values;
}

/** Latest observation with year <= MAX_YEAR. */
function latestPoint(series) {
  if (!series) return null;
  let best = null;
  for (const [key, raw] of Object.entries(series)) {
    const year = Number(key);
    const value = Number(raw);
    if (!Number.isFinite(year) || year > MAX_YEAR || !Number.isFinite(value)) continue;
    if (!best || year > best.year) best = { year, value };
  }
  return best;
}

function pointInYear(series, year) {
  if (!series || year == null) return null;
  const value = Number(series[String(year)]);
  return Number.isFinite(value) ? value : null;
}

function lifeRows(json) {
  const rows = json?.[1];
  if (!Array.isArray(rows)) {
    throw new Error("World Bank life expectancy response has no data rows");
  }
  const pages = json?.[0]?.pages;
  if (pages != null && pages !== 1) {
    throw new Error(`World Bank life expectancy returned ${pages} pages; raise per_page`);
  }
  return rows;
}

/**
 * @param {string[]} iso3List
 */
export async function fetchFiscalLifeBundle(iso3List) {
  const headers = { headers: { "User-Agent": "gdpincome.com/0.1" } };
  const lifeUrl = `https://api.worldbank.org/v2/country/${iso3List.join(";")}/indicator/SP.DYN.LE00.IN?format=json&date=2015:${MAX_YEAR}&per_page=1000`;

  const [debtJson, gdpJson, pcapJson, interestJson, lifeJson] = await Promise.all([
    cachedFetchJson(IMF_URL.debt, headers),
    cachedFetchJson(IMF_URL.gdp, headers),
    cachedFetchJson(IMF_URL.gdpPerCapita, headers),
    cachedFetchJson(IMF_URL.interest, headers),
    cachedFetchJson(lifeUrl, headers),
  ]);

  const debtByCode = seriesOf(debtJson, "GGXWDG_NGDP");
  const gdpByCode = seriesOf(gdpJson, "NGDPD");
  const pcapByCode = seriesOf(pcapJson, "NGDPDPC");
  const interestByCode = seriesOf(interestJson, "ie");

  /** @type {Record<string, { year: number, value: number }[]>} */
  const lifeByCode = {};
  for (const row of lifeRows(lifeJson)) {
    const code = row.countryiso3code;
    const year = Number(row.date);
    const value = row.value == null ? null : Number(row.value);
    if (!code || !Number.isFinite(year) || year > MAX_YEAR || !Number.isFinite(value)) continue;
    (lifeByCode[code] ??= []).push({ year, value });
  }

  const out = {};
  for (const code of iso3List) {
    const debt = latestPoint(debtByCode[code]);
    if (!debt) throw new Error(`${code}: IMF GGXWDG_NGDP has no year <= ${MAX_YEAR}`);
    const gdpBillions = pointInYear(gdpByCode[code], debt.year);
    const gdpPerCapita = pointInYear(pcapByCode[code], debt.year);
    if (gdpBillions == null || gdpPerCapita == null) {
      throw new Error(`${code}: IMF nominal GDP missing for debt year ${debt.year}`);
    }

    const interest = latestPoint(interestByCode[code]);
    let interestFields = {
      debtInterestPctGdp: null,
      debtInterestYear: null,
      nominalGdpPerCapitaInterestYearUsd: null,
      debtInterestPerCapitaUsd: null,
      gdpPerCapitaAfterInterestUsd: null,
    };
    const sources = [DEBT_SOURCE, GDP_SOURCE];
    if (interest) {
      const interestYearGdpPerCapita = pointInYear(pcapByCode[code], interest.year);
      if (interestYearGdpPerCapita == null) {
        throw new Error(`${code}: IMF GDP per capita missing for interest year ${interest.year}`);
      }
      const nominal = Math.round(interestYearGdpPerCapita);
      const interestPerCapita = Math.round((interestYearGdpPerCapita * interest.value) / 100);
      interestFields = {
        debtInterestPctGdp: round2(interest.value),
        debtInterestYear: interest.year,
        nominalGdpPerCapitaInterestYearUsd: nominal,
        debtInterestPerCapitaUsd: interestPerCapita,
        gdpPerCapitaAfterInterestUsd: nominal - interestPerCapita,
      };
      sources.push(INTEREST_SOURCE);
    }

    const life = (lifeByCode[code] ?? []).sort((a, b) => b.year - a.year);
    const latestLife = life[0];
    if (!latestLife) throw new Error(`${code}: World Bank SP.DYN.LE00.IN has no year <= ${MAX_YEAR}`);
    const priorLife = life.find((row) => row.year === latestLife.year - 5);
    if (!priorLife) {
      throw new Error(
        `${code}: life expectancy has ${latestLife.year} but no observation in ${latestLife.year - 5}`,
      );
    }
    sources.push(LIFE_SOURCE);

    out[code] = {
      publicDebtPctGdp: round1(debt.value),
      publicDebtYear: debt.year,
      publicDebtUsdMillions: round1(gdpBillions * (debt.value / 100) * 1000),
      publicDebtPerCapitaUsd: Math.round((gdpPerCapita * debt.value) / 100),
      ...interestFields,
      lifeExpectancyYears: latestLife.value,
      lifeExpectancyYear: latestLife.year,
      lifeExpectancyPrior5yYears: priorLife.value,
      lifeExpectancyPrior5yYear: priorLife.year,
      sources,
    };
  }

  return {
    byCode: out,
    queries: {
      debt: IMF_URL.debt,
      gdp: IMF_URL.gdp,
      gdpPerCapita: IMF_URL.gdpPerCapita,
      interest: IMF_URL.interest,
      life: lifeUrl,
    },
  };
}

export function attachFiscalLife(tree, row) {
  if (!row) throw new Error(`Missing debt / life expectancy for ${tree.code}`);
  const drop = new Set(FISCAL_SOURCE_LABELS);
  const { sources, ...fields } = row;
  return {
    ...tree,
    ...fields,
    sources: [...(tree.sources ?? []).filter((s) => !drop.has(s.label)), ...sources],
  };
}
