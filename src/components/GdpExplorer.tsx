"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import ContextPie from "@/components/ContextPie";
import { ContestedTooltip, MeasureBadge } from "@/components/DataQuality";
import DrilldownPie from "@/components/DrilldownPie";
import { useI18n, YoshinobuButton, type MessageKey } from "@/i18n/locale";
import {
  COUNTRY_GDP,
  COUNTRY_ORDER,
  GDP_DATA_META,
  WORLD_GDP,
  type CountryGdpTree,
} from "@/data/countries";
import {
  contestedFor,
  qualityForCountry,
} from "@/data/data-quality";
import { FlagIcon } from "@/lib/flags";
import {
  buildPieChart,
  formatPercent,
  fiveYearDelta,
  fiveYearDeltaClass,
  yearsFiveYearDelta,
  gdpTotalFiveYearDelta,
  inflationFiveYearDrag,
  realGdpFiveYearDelta,
  hasChildren,
  nodeAtPath,
  type ChartNode,
  type PieSlice,
  type SourceLink,
} from "@/lib/pie";

const VISIBLE_STORAGE_KEY = "gdpincome.visibleCountries.v3";
const PATH_STORAGE_KEY = "gdpincome.path.v1";
const COMPARE_STORAGE_KEY = "gdpincome.comparePath.v1";
const COMPARE_MODE_KEY = "gdpincome.compareMode.v1";
/** Match scripts/lib/http-cache.mjs — ~6 months */
const SNAPSHOT_STALE_MS = 182 * 24 * 60 * 60 * 1000;

function allCountryCodes(): string[] {
  return [...COUNTRY_ORDER];
}

function loadVisibleCodes(): string[] {
  if (typeof window === "undefined") return allCountryCodes();
  try {
    const raw = window.localStorage.getItem(VISIBLE_STORAGE_KEY);
    if (!raw) return allCountryCodes();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return allCountryCodes();
    const allowed = new Set(allCountryCodes());
    const codes = parsed.filter(
      (c): c is string => typeof c === "string" && allowed.has(c),
    );
    return codes.length > 0 ? codes : allCountryCodes();
  } catch {
    return allCountryCodes();
  }
}

function loadStoredPath(key: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === "string");
  } catch {
    return [];
  }
}

function loadPath(): string[] {
  return loadStoredPath(PATH_STORAGE_KEY);
}

function loadComparePath(): string[] {
  return loadStoredPath(COMPARE_STORAGE_KEY);
}

function loadCompareMode(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(COMPARE_MODE_KEY) === "1";
  } catch {
    return false;
  }
}

function isSnapshotStale(): boolean {
  const fetched = new Date(GDP_DATA_META.fetchedAt).getTime();
  if (Number.isNaN(fetched)) return true;
  return Date.now() - fetched >= SNAPSHOT_STALE_MS;
}

function buildFilteredWorld(visibleCodes: readonly string[]): ChartNode {
  const visible = new Set(visibleCodes);
  const children = (WORLD_GDP.children ?? []).filter(
    (c) => c.code != null && visible.has(c.code),
  );
  const amountMillions = children.reduce((s, c) => s + c.amountMillions, 0);
  const all = (WORLD_GDP.children ?? []).length;
  return {
    ...WORLD_GDP,
    name:
      children.length === all
        ? WORLD_GDP.name
        : `Selected economies (${children.length})`,
    amountMillions: Math.round(amountMillions * 10) / 10,
    description:
      children.length === all
        ? WORLD_GDP.description
        : `Filtered to ${children.length} of ${all} chart economies. Toggle countries with Edit list.`,
    children,
  };
}
function sourceSummary(
  sources: SourceLink[] | undefined,
  nameOf: (name: string) => string,
): string {
  if (!sources?.length) return "";
  return sources.map((s) => nameOf(s.label)).join(" · ");
}

function countryForNode(node: ChartNode): CountryGdpTree | null {
  if (node.id === "world") return null;
  return (
    COUNTRY_ORDER.map((c) => COUNTRY_GDP[c]).find(
      (c) => c.id === node.id || node.id.startsWith(`${c.id}-`),
    ) ?? null
  );
}

function MetricBlock({
  label,
  value,
  hint,
  note,
  delta,
  contested,
  emphasize,
  valueTone,
}: {
  label: string;
  value: ReactNode;
  hint: ReactNode;
  /** Small line under the value, such as debt per person or interest offset */
  note?: ReactNode;
  /** Optional 5-year change line under the value */
  delta?: { text: string; tone: "up" | "down" | "flat" } | null;
  contested?: ReturnType<typeof contestedFor>;
  emphasize?: boolean;
  /** Color the main value like a 5yr delta */
  valueTone?: "up" | "down" | "flat" | null;
}) {
  const heading = (
    <p className="text-[10px] uppercase tracking-[0.12em] text-[#8a7358]">
      {label}
    </p>
  );
  const valueColor = valueTone
    ? fiveYearDeltaClass(valueTone)
    : "text-[#1f3d4d]";
  return (
    <div>
      {contested ? (
        <ContestedTooltip field={contested}>{heading}</ContestedTooltip>
      ) : (
        heading
      )}
      <p
        className={`mt-0.5 font-semibold tabular-nums tracking-tight ${valueColor} ${
          emphasize ? "text-2xl" : "text-lg"
        }`}
      >
        {value}
      </p>
      {delta ? (
        <p
          className={`mt-0.5 text-[11px] font-medium tabular-nums ${fiveYearDeltaClass(delta.tone)}`}
        >
          {delta.text}
        </p>
      ) : null}
      {note ? (
        <p className="mt-0.5 text-[11px] leading-snug tabular-nums text-[#5c6b73]">{note}</p>
      ) : null}
      <p className="mt-0.5 text-[11px] text-[#5c6b73]">{hint}</p>
    </div>
  );
}

function afterInterestParts(
  country: CountryGdpTree,
  t: (key: MessageKey) => string,
  perCapitaUsd: (usd: number) => string,
): { amount?: string; lead: string; detail?: string } | null {
  if (
    country.gdpPerCapitaAfterInterestUsd == null ||
    country.nominalGdpPerCapitaInterestYearUsd == null ||
    country.debtInterestPerCapitaUsd == null ||
    country.debtInterestYear == null
  ) {
    return country.publicDebtYear != null ? { lead: t("afterInterestMissing") } : null;
  }
  const amount = perCapitaUsd(country.gdpPerCapitaAfterInterestUsd);
  const detail = `(${perCapitaUsd(country.nominalGdpPerCapitaInterestYearUsd)} − ${perCapitaUsd(country.debtInterestPerCapitaUsd)} ${t("interestWord")}, ${country.debtInterestYear})`;
  return {
    amount,
    lead: `${amount} ${t("afterInterest")}`,
    detail,
  };
}

function afterInterestText(
  country: CountryGdpTree,
  t: (key: MessageKey) => string,
  perCapitaUsd: (usd: number) => string,
): string | null {
  const parts = afterInterestParts(country, t, perCapitaUsd);
  if (!parts) return null;
  return parts.detail ? `${parts.lead} ${parts.detail}` : parts.lead;
}

/** Drop one decimal from a formatted figure so a multiplier can sit beside it. */
function tightenFigure(text: string): string {
  return text.replace(/(\d+)\.(\d)(\d+)/g, (_, whole: string, tenth: string, rest: string) => {
    const rounded = Math.round(Number(`${whole}.${tenth}${rest}`) * 10) / 10;
    return String(rounded);
  });
}

function debtHintText(country: CountryGdpTree, t: (key: MessageKey) => string): string {
  if (country.publicDebtYear == null || country.publicDebtPctGdp == null) return t("empty");
  return `${t("debtHint")} · ${country.publicDebtYear} · ${country.publicDebtPctGdp.toFixed(1)}% ${t("ofGdp")}`;
}

function largerTimes(
  a: number | null | undefined,
  b: number | null | undefined,
  ja: boolean,
  timesOther: string,
): { side: "a" | "b"; text: string; title: string } | null {
  if (a == null || b == null || !Number.isFinite(a) || !Number.isFinite(b)) return null;
  const absA = Math.abs(a);
  const absB = Math.abs(b);
  if (absA === 0 || absB === 0) return null;
  const ratio = Math.max(absA, absB) / Math.min(absA, absB);
  if (ratio < 1.05) return null;
  const text = `${ratio.toFixed(1).replace(/\.0$/, "")}${ja ? "倍" : "×"}`;
  return {
    side: absA > absB ? "a" : "b",
    text,
    title: ja ? `${timesOther}${text}` : `${text} ${timesOther}`,
  };
}

function MeasureWarning({
  country,
  showName = false,
}: {
  country: CountryGdpTree;
  showName?: boolean;
}) {
  const { t, label, sourceSummary: summarize } = useI18n();
  const { source, country: quality } = qualityForCountry(
    country.code ?? "",
    country.sourceKey,
  );
  if (!source || !quality.measureWarning) return null;
  return (
    <p
      className="rounded-md border border-[#e8dcc8] bg-[#fff8ee] px-3 py-2 text-xs leading-relaxed text-[#8a7358]"
      role="note"
    >
      {showName ? (
        <span className="font-medium text-[#1f3d4d]">{label(country.name, country.id)}. </span>
      ) : null}
      <span className="font-medium text-[#1f3d4d]">{t("notComparable")}</span>
      {summarize(source.sourceKey, source.summary)}
    </p>
  );
}

function DemographicsBanner({
  country,
  dense = false,
}: {
  country: CountryGdpTree;
  dense?: boolean;
}) {
  const { t, label, money, people, perCapitaUsd, delta, ja, badge } = useI18n();
  if (country.gdpPerCapitaUsd == null || country.population == null) return null;
  const under18 = country.pctUnder18Proxy;
  const over65 = country.pct65Plus;
  const countryName = label(country.name, country.id);
  const underLabel = label(country.under18ProxyLabel ?? "Ages 0–14");
  const showDelta = (
    row: { text: string; tone: "up" | "down" | "flat" } | null,
  ) => (row ? { ...row, text: delta(row.text) } : null);
  const yieldPct = country.bondYield10y;
  const yieldPeriod = country.bondYield10yPeriod;
  const { source, country: quality } = qualityForCountry(
    country.code ?? "",
    country.sourceKey,
  );

  const pcapDelta = fiveYearDelta(
    country.gdpPerCapitaWbUsd,
    country.gdpPerCapitaWbPrior5yUsd,
  );
  const yieldDelta = fiveYearDelta(yieldPct, country.bondYield10yPrior5y);
  const popDelta = fiveYearDelta(country.population, country.populationPrior5y);
  const underDelta = fiveYearDelta(under18, country.pctUnder15Prior5y);
  const overDelta = fiveYearDelta(over65, country.pct65PlusPrior5y);
  const gdp5yr = gdpTotalFiveYearDelta(country);
  const inflationDrag = inflationFiveYearDrag(country);
  const realGdp = realGdpFiveYearDelta(country);
  const lifeDelta = showDelta(
    yearsFiveYearDelta(country.lifeExpectancyYears, country.lifeExpectancyPrior5yYears),
  );
  const interestNote = afterInterestText(country, t, perCapitaUsd);

  return (
    <div className="flex flex-col gap-2">
      <div
        className={`grid gap-3 rounded-md border border-[#e0d6c6] bg-[#fbf8f2] px-4 py-3 ${
          dense ? "grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-4"
        }`}
        role="group"
        aria-label={`${countryName} ${t("gdp5")}`}
      >
        <MetricBlock
          label={t("gdp5")}
          emphasize
          value={gdp5yr ? delta(gdp5yr.text) : t("empty")}
          valueTone={gdp5yr?.tone ?? null}
          delta={null}
          hint={t("nominalHint")}
        />
        <MetricBlock
          label={t("population")}
          contested={contestedFor(country.code ?? "", "population")}
          value={people(country.population)}
          delta={showDelta(popDelta)}
          hint={`${country.population.toLocaleString(ja ? "ja-JP" : "en-US")} · ${country.populationYear}`}
        />
        <MetricBlock
          label={t("gdpPerCapita")}
          contested={contestedFor(country.code ?? "", "gdpPerCapita")}
          value={perCapitaUsd(country.gdpPerCapitaUsd)}
          delta={showDelta(pcapDelta)}
          note={interestNote}
          hint={
            quality.measureWarning
              ? `${t("derivedFrom")} ${source ? badge(source.badge) : ""} ${t("notPeer")}`
              : pcapDelta
                ? `${t("pcapIndustry")} (${country.populationYear}) · ${t("pcapWb")}`
                : `${t("pcapPlain")} (${country.populationYear})`
          }
        />
        <MetricBlock
          label={t("nationalDebt")}
          value={
            country.publicDebtUsdMillions != null
              ? money(country.publicDebtUsdMillions)
              : t("empty")
          }
          note={
            country.publicDebtPerCapitaUsd != null
              ? `${perCapitaUsd(country.publicDebtPerCapitaUsd)} ${t("debtPerPerson")}`
              : null
          }
          hint={debtHintText(country, t)}
        />
        <MetricBlock
          label={t("inflation5")}
          emphasize
          value={inflationDrag ? delta(inflationDrag.text) : t("empty")}
          valueTone={inflationDrag?.tone ?? null}
          delta={null}
          hint={
            country.cpiPrior5yYear != null && country.cpiYear != null
              ? `${t("cpiPrefix")}${country.cpiPrior5yYear}→${country.cpiYear}`
              : t("inflationFallback")
          }
        />
        <MetricBlock
          label={t("real5")}
          emphasize
          value={realGdp ? delta(realGdp.text) : t("empty")}
          valueTone={realGdp?.tone ?? null}
          delta={null}
          hint={t("realHint")}
        />
        <MetricBlock
          label={t("yield")}
          value={yieldPct != null ? `${yieldPct.toFixed(2)}%` : t("empty")}
          delta={showDelta(yieldDelta)}
          hint={`${t("govtBond")}${yieldPeriod ? ` · ${yieldPeriod}` : ""}`}
        />
        <MetricBlock
          label={t("under18")}
          contested={contestedFor(country.code ?? "", "ageStructure")}
          value={under18 != null ? `${under18}%` : t("empty")}
          delta={showDelta(underDelta)}
          hint={`${underLabel} ${t("shareOfPop")}${
            country.pctUnder15Year != null ? ` · ${country.pctUnder15Year}` : ""
          }`}
        />
        <MetricBlock
          label={t("ages65")}
          contested={contestedFor(country.code ?? "", "ageStructure")}
          value={over65 != null ? `${over65}%` : t("empty")}
          delta={showDelta(overDelta)}
          hint={`${t("shareOfPop")}${
            country.pct65PlusYear != null ? ` · ${country.pct65PlusYear}` : ""
          }`}
        />
        <MetricBlock
          label={t("lifeExpectancy")}
          value={
            country.lifeExpectancyYears != null
              ? `${country.lifeExpectancyYears.toFixed(1)}${t("yearsSuffix")}`
              : t("empty")
          }
          delta={lifeDelta}
          hint={
            country.lifeExpectancyYear != null
              ? `${t("lifeHint")} · ${country.lifeExpectancyYear}`
              : t("empty")
          }
        />
      </div>
      <MeasureWarning country={country} />
    </div>
  );
}

function CompareMetrics({
  left,
  right,
}: {
  left: CountryGdpTree;
  right: CountryGdpTree;
}) {
  const { t, label, money, people, perCapitaUsd, delta, ja, badge } = useI18n();
  const showDelta = (
    row: { text: string; tone: "up" | "down" | "flat" } | null,
  ) => (row ? { ...row, text: tightenFigure(delta(row.text)) } : null);

  function stats(country: CountryGdpTree) {
    const { source, country: quality } = qualityForCountry(
      country.code ?? "",
      country.sourceKey,
    );
    const underLabel = label(country.under18ProxyLabel ?? "Ages 0–14");
    const pcapChange = fiveYearDelta(
      country.gdpPerCapitaWbUsd,
      country.gdpPerCapitaWbPrior5yUsd,
    );
    return {
      country,
      source,
      quality,
      name: label(country.name, country.id),
      gdp5: showDelta(gdpTotalFiveYearDelta(country)),
      inflation: showDelta(inflationFiveYearDrag(country)),
      real: showDelta(realGdpFiveYearDelta(country)),
      pcapDelta: showDelta(pcapChange),
      yieldDelta: showDelta(fiveYearDelta(country.bondYield10y, country.bondYield10yPrior5y)),
      popDelta: showDelta(fiveYearDelta(country.population, country.populationPrior5y)),
      underDelta: showDelta(fiveYearDelta(country.pctUnder18Proxy, country.pctUnder15Prior5y)),
      overDelta: showDelta(fiveYearDelta(country.pct65Plus, country.pct65PlusPrior5y)),
      lifeDelta: showDelta(
        yearsFiveYearDelta(country.lifeExpectancyYears, country.lifeExpectancyPrior5yYears),
      ),
      interest: afterInterestParts(country, t, perCapitaUsd),
      debtAmount:
        country.publicDebtPerCapitaUsd != null
          ? perCapitaUsd(country.publicDebtPerCapitaUsd)
          : undefined,
      debtTitle: debtHintText(country, t),
      lifeTitle:
        country.lifeExpectancyYear != null
          ? `${t("lifeHint")} · ${country.lifeExpectancyYear}`
          : undefined,
      inflationTitle:
        country.cpiPrior5yYear != null && country.cpiYear != null
          ? `${t("cpiPrefix")}${country.cpiPrior5yYear}→${country.cpiYear}`
          : t("inflationFallback"),
      pcapTitle: quality.measureWarning
        ? `${t("derivedFrom")} ${source ? badge(source.badge) : ""} ${t("notPeer")}`
        : pcapChange
          ? `${t("pcapIndustry")} (${country.populationYear}) · ${t("pcapWb")}`
          : `${t("pcapPlain")} (${country.populationYear})`,
      yieldTitle: `${t("govtBond")}${country.bondYield10yPeriod ? ` · ${country.bondYield10yPeriod}` : ""}`,
      popTitle:
        country.population != null
          ? `${country.population.toLocaleString(ja ? "ja-JP" : "en-US")} · ${country.populationYear ?? ""}`
          : undefined,
      underTitle: `${underLabel} ${t("shareOfPop")}${
        country.pctUnder15Year != null ? ` · ${country.pctUnder15Year}` : ""
      }`,
      overTitle: `${t("shareOfPop")}${
        country.pct65PlusYear != null ? ` · ${country.pct65PlusYear}` : ""
      }`,
    };
  }

  const a = stats(left);
  const b = stats(right);
  const timesOther = t("timesOther");
  const gdp5Left = gdpTotalFiveYearDelta(left);
  const gdp5Right = gdpTotalFiveYearDelta(right);
  const inflationLeft = inflationFiveYearDrag(left);
  const inflationRight = inflationFiveYearDrag(right);
  const realLeft = realGdpFiveYearDelta(left);
  const realRight = realGdpFiveYearDelta(right);
  const pcap5Left = fiveYearDelta(left.gdpPerCapitaWbUsd, left.gdpPerCapitaWbPrior5yUsd);
  const pcap5Right = fiveYearDelta(right.gdpPerCapitaWbUsd, right.gdpPerCapitaWbPrior5yUsd);
  const yield5Left = fiveYearDelta(left.bondYield10y, left.bondYield10yPrior5y);
  const yield5Right = fiveYearDelta(right.bondYield10y, right.bondYield10yPrior5y);
  const pop5Left = fiveYearDelta(left.population, left.populationPrior5y);
  const pop5Right = fiveYearDelta(right.population, right.populationPrior5y);
  const under5Left = fiveYearDelta(left.pctUnder18Proxy, left.pctUnder15Prior5y);
  const under5Right = fiveYearDelta(right.pctUnder18Proxy, right.pctUnder15Prior5y);
  const over5Left = fiveYearDelta(left.pct65Plus, left.pct65PlusPrior5y);
  const over5Right = fiveYearDelta(right.pct65Plus, right.pct65PlusPrior5y);
  const life5Left = yearsFiveYearDelta(left.lifeExpectancyYears, left.lifeExpectancyPrior5yYears);
  const life5Right = yearsFiveYearDelta(right.lifeExpectancyYears, right.lifeExpectancyPrior5yYears);
  const gdpTimes = largerTimes(left.amountMillions, right.amountMillions, ja, timesOther);
  const gdp5Times = largerTimes(gdp5Left?.pct, gdp5Right?.pct, ja, timesOther);
  const inflationTimes = largerTimes(inflationLeft?.pct, inflationRight?.pct, ja, timesOther);
  const realTimes = largerTimes(realLeft?.pct, realRight?.pct, ja, timesOther);
  const pcapTimes = largerTimes(left.gdpPerCapitaUsd, right.gdpPerCapitaUsd, ja, timesOther);
  const pcap5Times = largerTimes(pcap5Left?.pct, pcap5Right?.pct, ja, timesOther);
  const yieldTimes = largerTimes(left.bondYield10y, right.bondYield10y, ja, timesOther);
  const yield5Times = largerTimes(yield5Left?.pct, yield5Right?.pct, ja, timesOther);
  const popTimes = largerTimes(left.population, right.population, ja, timesOther);
  const pop5Times = largerTimes(pop5Left?.pct, pop5Right?.pct, ja, timesOther);
  const underTimes = largerTimes(left.pctUnder18Proxy, right.pctUnder18Proxy, ja, timesOther);
  const under5Times = largerTimes(under5Left?.pct, under5Right?.pct, ja, timesOther);
  const overTimes = largerTimes(left.pct65Plus, right.pct65Plus, ja, timesOther);
  const over5Times = largerTimes(over5Left?.pct, over5Right?.pct, ja, timesOther);
  const debtTimes = largerTimes(left.publicDebtUsdMillions, right.publicDebtUsdMillions, ja, timesOther);
  const debtCapTimes = largerTimes(left.publicDebtPerCapitaUsd, right.publicDebtPerCapitaUsd, ja, timesOther);
  const afterTimes = largerTimes(
    left.gdpPerCapitaAfterInterestUsd,
    right.gdpPerCapitaAfterInterestUsd,
    ja,
    timesOther,
  );
  const lifeTimes = largerTimes(left.lifeExpectancyYears, right.lifeExpectancyYears, ja, timesOther);
  const life5Times = largerTimes(life5Left?.pct, life5Right?.pct, ja, timesOther);

  type Side = "a" | "b";
  type Tone = "up" | "down" | "flat";
  type Change = { text: string; tone: Tone } | null;
  type Cell = {
    value: ReactNode;
    tone?: Tone | null;
    change?: Change;
    changeTimes?: { text: string; title: string } | null;
    title?: string;
    times?: { text: string; title: string } | null;
    note?: string;
    noteDetail?: string;
    noteTimes?: { text: string; title: string } | null;
  };

  function timesFor(mark: ReturnType<typeof largerTimes>, side: Side) {
    if (!mark || mark.side !== side) return null;
    return { text: mark.text, title: mark.title };
  }

  function rateCell(
    row: { text: string; tone: Tone } | null,
    title: string | undefined,
    times: Cell["times"],
  ): Cell {
    return {
      value: row ? row.text : t("empty"),
      tone: row?.tone ?? null,
      title,
      times,
    };
  }

  const rows: { key: string; label: string; left: Cell; right: Cell }[] = [
    {
      key: "gdp",
      label: t("gdpByIndustry"),
      left: {
        value: money(left.amountMillions, true),
        change: a.gdp5,
        changeTimes: timesFor(gdp5Times, "a"),
        title: t("nominalHint"),
        times: timesFor(gdpTimes, "a"),
      },
      right: {
        value: money(right.amountMillions, true),
        change: b.gdp5,
        changeTimes: timesFor(gdp5Times, "b"),
        title: t("nominalHint"),
        times: timesFor(gdpTimes, "b"),
      },
    },
    {
      key: "pop",
      label: t("population"),
      left: {
        value: left.population != null ? people(left.population) : t("empty"),
        change: a.popDelta,
        changeTimes: timesFor(pop5Times, "a"),
        title: a.popTitle,
        times: timesFor(popTimes, "a"),
      },
      right: {
        value: right.population != null ? people(right.population) : t("empty"),
        change: b.popDelta,
        changeTimes: timesFor(pop5Times, "b"),
        title: b.popTitle,
        times: timesFor(popTimes, "b"),
      },
    },
    {
      key: "pcap",
      label: t("gdpPerCapita"),
      left: {
        value: left.gdpPerCapitaUsd != null ? perCapitaUsd(left.gdpPerCapitaUsd) : t("empty"),
        change: a.pcapDelta,
        changeTimes: timesFor(pcap5Times, "a"),
        title: a.pcapTitle,
        times: timesFor(pcapTimes, "a"),
        note: a.interest?.amount ?? a.interest?.lead,
        noteDetail: a.interest?.amount
          ? `${t("afterInterest")} ${a.interest.detail ?? ""}`.trim()
          : a.interest?.detail,
        noteTimes: a.interest?.amount ? timesFor(afterTimes, "a") : null,
      },
      right: {
        value: right.gdpPerCapitaUsd != null ? perCapitaUsd(right.gdpPerCapitaUsd) : t("empty"),
        change: b.pcapDelta,
        changeTimes: timesFor(pcap5Times, "b"),
        title: b.pcapTitle,
        times: timesFor(pcapTimes, "b"),
        note: b.interest?.amount ?? b.interest?.lead,
        noteDetail: b.interest?.amount
          ? `${t("afterInterest")} ${b.interest.detail ?? ""}`.trim()
          : b.interest?.detail,
        noteTimes: b.interest?.amount ? timesFor(afterTimes, "b") : null,
      },
    },
    {
      key: "debt",
      label: t("nationalDebt"),
      left: {
        value: left.publicDebtUsdMillions != null ? money(left.publicDebtUsdMillions, true) : t("empty"),
        title: a.debtTitle,
        times: timesFor(debtTimes, "a"),
        note: a.debtAmount,
        noteDetail: a.debtAmount ? t("debtPerPerson") : undefined,
        noteTimes: timesFor(debtCapTimes, "a"),
      },
      right: {
        value: right.publicDebtUsdMillions != null ? money(right.publicDebtUsdMillions, true) : t("empty"),
        title: b.debtTitle,
        times: timesFor(debtTimes, "b"),
        note: b.debtAmount,
        noteDetail: b.debtAmount ? t("debtPerPerson") : undefined,
        noteTimes: timesFor(debtCapTimes, "b"),
      },
    },
    {
      key: "inflation",
      label: t("inflation5"),
      left: rateCell(a.inflation, a.inflationTitle, timesFor(inflationTimes, "a")),
      right: rateCell(b.inflation, b.inflationTitle, timesFor(inflationTimes, "b")),
    },
    {
      key: "real",
      label: t("real5"),
      left: rateCell(a.real, t("realHint"), timesFor(realTimes, "a")),
      right: rateCell(b.real, t("realHint"), timesFor(realTimes, "b")),
    },
    {
      key: "yield",
      label: t("yield"),
      left: {
        value: left.bondYield10y != null ? `${left.bondYield10y.toFixed(2)}%` : t("empty"),
        change: a.yieldDelta,
        changeTimes: timesFor(yield5Times, "a"),
        title: a.yieldTitle,
        times: timesFor(yieldTimes, "a"),
      },
      right: {
        value: right.bondYield10y != null ? `${right.bondYield10y.toFixed(2)}%` : t("empty"),
        change: b.yieldDelta,
        changeTimes: timesFor(yield5Times, "b"),
        title: b.yieldTitle,
        times: timesFor(yieldTimes, "b"),
      },
    },
    {
      key: "under",
      label: t("under18"),
      left: {
        value: left.pctUnder18Proxy != null ? `${left.pctUnder18Proxy}%` : t("empty"),
        change: a.underDelta,
        changeTimes: timesFor(under5Times, "a"),
        title: a.underTitle,
        times: timesFor(underTimes, "a"),
      },
      right: {
        value: right.pctUnder18Proxy != null ? `${right.pctUnder18Proxy}%` : t("empty"),
        change: b.underDelta,
        changeTimes: timesFor(under5Times, "b"),
        title: b.underTitle,
        times: timesFor(underTimes, "b"),
      },
    },
    {
      key: "over",
      label: t("ages65"),
      left: {
        value: left.pct65Plus != null ? `${left.pct65Plus}%` : t("empty"),
        change: a.overDelta,
        changeTimes: timesFor(over5Times, "a"),
        title: a.overTitle,
        times: timesFor(overTimes, "a"),
      },
      right: {
        value: right.pct65Plus != null ? `${right.pct65Plus}%` : t("empty"),
        change: b.overDelta,
        changeTimes: timesFor(over5Times, "b"),
        title: b.overTitle,
        times: timesFor(overTimes, "b"),
      },
    },
    {
      key: "life",
      label: t("lifeExpectancy"),
      left: {
        value:
          left.lifeExpectancyYears != null
            ? `${left.lifeExpectancyYears.toFixed(1)}${t("yearsSuffix")}`
            : t("empty"),
        change: a.lifeDelta,
        changeTimes: timesFor(life5Times, "a"),
        title: a.lifeTitle,
        times: timesFor(lifeTimes, "a"),
      },
      right: {
        value:
          right.lifeExpectancyYears != null
            ? `${right.lifeExpectancyYears.toFixed(1)}${t("yearsSuffix")}`
            : t("empty"),
        change: b.lifeDelta,
        changeTimes: timesFor(life5Times, "b"),
        title: b.lifeTitle,
        times: timesFor(lifeTimes, "b"),
      },
    },
  ];

  function TimesMark({ mark }: { mark: { text: string; title: string } }) {
    return (
      <span
        className="shrink-0 rounded bg-[#1f3d4d] px-1 py-0.5 text-[9px] font-semibold leading-none text-[#f7f3ec]"
        title={mark.title}
      >
        {mark.text}
      </span>
    );
  }

  function CellView({ cell, shade }: { cell: Cell; shade: "left" | "right" }) {
    const valueColor = cell.tone ? fiveYearDeltaClass(cell.tone) : "text-[#1f3d4d]";
    return (
      <div
        className={`min-w-0 overflow-hidden px-2 py-2 sm:px-3 ${
          shade === "left" ? "bg-[#fbf8f2]" : "border-l border-[#e0d6c6] bg-[#e7eef1]"
        }`}
      >
        <div title={cell.title} className="min-w-0">
          <p className={`flex max-w-full flex-nowrap items-baseline gap-1 text-[11px] font-semibold leading-tight tabular-nums sm:text-[13px] ${valueColor}`}>
            <span className="min-w-0">{cell.value}</span>
            {cell.times ? <TimesMark mark={cell.times} /> : null}
          </p>
          {cell.change ? (
            <p className={`mt-0.5 flex max-w-full flex-nowrap items-baseline gap-1 text-[10px] font-medium leading-tight tabular-nums ${fiveYearDeltaClass(cell.change.tone)}`}>
              <span className="min-w-0">{cell.change.text}</span>
              {cell.changeTimes ? <TimesMark mark={cell.changeTimes} /> : null}
            </p>
          ) : null}
          {cell.note ? (
            <p className="mt-0.5 max-w-full text-[10px] leading-snug text-[#5c6b73]">
              <span className="inline-flex max-w-full flex-nowrap items-baseline gap-1">
                <span className="min-w-0 tabular-nums">{cell.note}</span>
                {cell.noteTimes ? <TimesMark mark={cell.noteTimes} /> : null}
              </span>
              {cell.noteDetail ? (
                <span className="mt-0.5 block break-words tabular-nums">{cell.noteDetail}</span>
              ) : null}
            </p>
          ) : null}
          {cell.title ? (
            <p className="mt-0.5 break-words text-[10px] leading-snug text-[#5c6b73]">{cell.title}</p>
          ) : null}
        </div>
      </div>
    );
  }

  function Head({ country, shade }: { country: CountryGdpTree; shade: "left" | "right" }) {
    const name = label(country.name, country.id);
    return (
      <div
        className={`flex min-w-0 items-center gap-2 overflow-hidden px-2 py-2 sm:px-3 ${
          shade === "left" ? "bg-[#f4efe6]" : "border-l border-[#e0d6c6] bg-[#dce7ee]"
        }`}
      >
        {country.code ? (
          <FlagIcon
            iso3={country.code}
            className="h-[14px] w-[21px] shrink-0 overflow-hidden rounded-[2px]"
            title={name}
          />
        ) : null}
        <span className="truncate text-sm font-semibold text-[#1f3d4d]">{name}</span>
        {country.code ? (
          <span className="text-[10px] font-semibold tracking-wide text-[#5c6b73]">{country.code}</span>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex w-full min-w-0 max-w-full flex-col gap-2">
      <div className="w-full min-w-0 max-w-full overflow-hidden rounded-md border border-[#e0d6c6]">
        <div className="grid w-full min-w-0 grid-cols-2">
          <Head country={left} shade="left" />
          <Head country={right} shade="right" />
          {rows.map((row) => (
            <div key={row.key} className="col-span-2 grid min-w-0 grid-cols-2 border-t border-[#e0d6c6]">
              <div className="col-span-2 break-words bg-[#f7f3ec] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#8a7358] sm:px-3">
                {row.label}
              </div>
              <CellView cell={row.left} shade="left" />
              <CellView cell={row.right} shade="right" />
            </div>
          ))}
        </div>
      </div>
      <MeasureWarning country={left} showName />
      <MeasureWarning country={right} showName />
    </div>
  );
}

function SliceRow({
  slice,
  active,
  drillable,
  showRemove,
  onHover,
  onOpen,
  onRemove,
}: {
  slice: PieSlice;
  active: boolean;
  drillable: boolean;
  showRemove?: boolean;
  onHover: (id: string | null) => void;
  onOpen: () => void;
  onRemove?: () => void;
}) {
  const { t, label: nameOf, money, perCapitaUsd, delta, badge, sourceSummary: summarize } = useI18n();
  const amountClass = slice.isOffset ? "text-[#8a7358]" : "text-[#5c6b73]";
  const nameClass = slice.isOffset
    ? "text-[#5c6b73]"
    : drillable
      ? "text-[#1f3d4d]"
      : "text-[#5c6b73]";
  const swatch = slice.isOffset ? (
    <span
      className="relative h-2.5 w-2.5 shrink-0 overflow-hidden rounded-full border border-[#8a7358]"
      aria-hidden
      style={{
        backgroundImage:
          "repeating-linear-gradient(45deg, #f3ebe0 0 2px, #8a7358 2px 3.5px)",
      }}
    />
  ) : (
    <span
      className={`h-2.5 w-2.5 shrink-0 rounded-full ${drillable ? "" : "opacity-70"}`}
      style={{ backgroundColor: slice.color }}
    />
  );

  const period =
    slice.periodLabel ?? (slice.year != null ? String(slice.year) : null);
  const sliceName = nameOf(slice.name, slice.id);
  const metrics = `${money(slice.amountMillions)} · ${formatPercent(slice.percent)}`;
  const perCapita =
    "gdpPerCapitaUsd" in slice && typeof slice.gdpPerCapitaUsd === "number"
      ? perCapitaUsd(slice.gdpPerCapitaUsd)
      : null;
  const bondYield =
    "bondYield10y" in slice && typeof slice.bondYield10y === "number"
      ? `${slice.bondYield10y.toFixed(2)}%`
      : null;
  const gdp5yr = gdpTotalFiveYearDelta(slice);
  const inflationDrag = inflationFiveYearDrag(slice);
  const realGdp = realGdpFiveYearDelta(slice);
  const countryCode =
    "code" in slice && typeof slice.code === "string" ? slice.code : null;
  const contestedPop = countryCode
    ? contestedFor(countryCode, "population")
    : undefined;
  const measureQ = countryCode
    ? qualityForCountry(
        countryCode,
        countryCode in COUNTRY_GDP
          ? COUNTRY_GDP[countryCode as keyof typeof COUNTRY_GDP].sourceKey
          : undefined,
      )
    : null;
  const countryRow =
    countryCode && countryCode in COUNTRY_GDP
      ? COUNTRY_GDP[countryCode as keyof typeof COUNTRY_GDP]
      : null;
  const countrySlice = countryRow != null && slice.id === countryRow.id ? countryRow : null;
  const interestLine = countrySlice ? afterInterestText(countrySlice, t, perCapitaUsd) : null;
  const debtLine =
    countrySlice?.publicDebtUsdMillions != null && countrySlice.publicDebtPerCapitaUsd != null
      ? `${t("nationalDebt")}: ${money(countrySlice.publicDebtUsdMillions)} · ${perCapitaUsd(countrySlice.publicDebtPerCapitaUsd)} ${t("debtPerPerson")}`
      : null;
  const lifeChange = countrySlice
    ? yearsFiveYearDelta(countrySlice.lifeExpectancyYears, countrySlice.lifeExpectancyPrior5yYears)
    : null;
  const lifeLine =
    countrySlice?.lifeExpectancyYears != null
      ? `${t("lifeExpectancy")}: ${countrySlice.lifeExpectancyYears.toFixed(1)}${t("yearsSuffix")}${
          lifeChange ? ` ${delta(lifeChange.text)}` : ""
        }`
      : null;
  const tip = [
    sliceName,
    metrics,
    gdp5yr ? `${t("gdp5")}: ${delta(gdp5yr.text)}` : null,
    inflationDrag ? `${t("inflation5")}: ${delta(inflationDrag.text)}` : null,
    realGdp ? `${t("real5")}: ${delta(realGdp.text)}` : null,
    perCapita ? `${t("gdpPerCapita")}: ${perCapita}` : null,
    interestLine,
    debtLine,
    lifeLine,
    bondYield ? `${t("yield")}: ${bondYield}` : null,
    contestedPop ? t("contestedSeries") : null,
    measureQ?.source && !measureQ.source.levelComparableToNominalUsd
      ? summarize(measureQ.source.sourceKey, measureQ.source.summary)
      : null,
    period ? `${t("asOf")} ${period}` : null,
    sourceSummary(slice.sources, nameOf),
  ]
    .filter(Boolean)
    .join("\n");

  const label = (
    <>
      {swatch}
      <span className={`min-w-0 flex-1 truncate text-sm ${nameClass}`}>
        {"code" in slice &&
        typeof slice.code === "string" &&
        slice.code in COUNTRY_GDP ? (
          <FlagIcon
            iso3={slice.code}
            className="mr-1.5 inline-block h-2.5 w-[0.9375rem] align-middle rounded-[1px]"
          />
        ) : null}
        {sliceName}
        {contestedPop ? (
          <span className="ml-1.5 text-[9px] uppercase tracking-wide text-[#c45c26]">
            {t("contested")}
          </span>
        ) : measureQ?.source && !measureQ.source.levelComparableToNominalUsd ? (
          <span className="ml-1.5 text-[9px] uppercase tracking-wide text-[#8a7358]">
            {badge(measureQ.source.badge)}
          </span>
        ) : null}
        {period ? (
          <span className="ml-1.5 text-[10px] tabular-nums text-[#8a7358]">
            {period}
          </span>
        ) : null}
      </span>
      <span className={`shrink-0 text-right text-xs tabular-nums ${amountClass}`}>
        <span className="block">{metrics}</span>
        {gdp5yr ? (
          <span
            className={`block text-[10px] font-medium ${fiveYearDeltaClass(gdp5yr.tone)}`}
          >
            {delta(gdp5yr.text)}
          </span>
        ) : null}
        {inflationDrag ? (
          <span
            className={`block text-[10px] font-medium ${fiveYearDeltaClass(inflationDrag.tone)}`}
          >
            {t("infl")} {delta(inflationDrag.text)}
          </span>
        ) : null}
        {realGdp ? (
          <span
            className={`block text-[10px] font-medium ${fiveYearDeltaClass(realGdp.tone)}`}
          >
            {t("realWord")} {delta(realGdp.text)}
          </span>
        ) : null}
        {perCapita || bondYield ? (
          <span className="block text-[10px] text-[#8a7358]">
            {[perCapita ? `${perCapita}${t("cap")}` : null, bondYield ? `${bondYield} ${t("tenY")}` : null]
              .filter(Boolean)
              .join(" · ")}
          </span>
        ) : null}
      </span>
      <span
        className={`w-3 shrink-0 text-center text-xs ${
          drillable ? "text-[#2a6f97]" : "text-[#d4c4ae]"
        }`}
        aria-hidden
      >
        {drillable ? "›" : "·"}
      </span>
    </>
  );

  return (
    <li
      className={`flex items-center gap-2 rounded-lg px-1.5 py-1 ${active ? "bg-[#f4efe6]" : ""}`}
      title={tip}
      onMouseEnter={() => onHover(slice.id)}
      onMouseLeave={() => onHover(null)}
    >
      {drillable ? (
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          onClick={onOpen}
          aria-label={`${sliceName}, ${t("openDetails")}`}
          title={tip}
        >
          {label}
        </button>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-2">{label}</div>
      )}
      {showRemove && onRemove ? (
        <button
          type="button"
          className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium text-[#8a7358] hover:bg-[#ebe4d8] hover:text-[#1f3d4d]"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          aria-label={`${t("remove")} ${sliceName} ${t("fromComparison")}`}
          title={`${t("remove")} ${sliceName}`}
        >
          ✕
        </button>
      ) : null}
    </li>
  );
}

function ScopeTabs({
  path,
  compareCode,
  selectingCompare,
  visibleCodes,
  editing,
  onWorld,
  onCountry,
  onToggle,
  onEditingChange,
  onSelectAll,
  onResetDefault,
}: {
  path: string[];
  compareCode: string | null;
  selectingCompare: boolean;
  visibleCodes: readonly string[];
  editing: boolean;
  onWorld: () => void;
  onCountry: (code: string) => void;
  onToggle: (code: string) => void;
  onEditingChange: (editing: boolean) => void;
  onSelectAll: () => void;
  onResetDefault: () => void;
}) {
  const { t, label, badge } = useI18n();
  const visible = new Set(visibleCodes);
  const activeCountry =
    path.length > 0
      ? COUNTRY_ORDER.find((code) => COUNTRY_GDP[code].id === path[0])
      : null;
  const codesToShow = editing
    ? [...COUNTRY_ORDER]
    : COUNTRY_ORDER.filter((c) => visible.has(c));

  const chip =
    "inline-flex shrink-0 flex-col items-center justify-center gap-0.5 rounded-[3px] px-1 py-1 transition";

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] leading-none">
        <button
          type="button"
          onClick={() => onEditingChange(!editing)}
          className={`rounded px-1.5 py-0.5 font-semibold uppercase tracking-wide transition ${
            editing
              ? "bg-[#c45c26] text-[#fff8f2]"
              : "bg-[#ebe4d8] text-[#1f3d4d] hover:bg-[#e0d6c6]"
          }`}
          aria-pressed={editing}
        >
          {editing ? t("done") : t("editList")}
        </button>
        {editing ? (
          <>
            <button
              type="button"
              onClick={onSelectAll}
              className="font-medium text-[#2a6f97] hover:underline"
            >
              {t("selectAll")}
            </button>
            <button
              type="button"
              onClick={onResetDefault}
              className="font-medium text-[#2a6f97] hover:underline"
            >
              {t("reset")}
            </button>
            <span className="text-[#8a7358]">
              {t("tapFlags")} · {visibleCodes.length} {t("on")}
            </span>
          </>
        ) : visibleCodes.length < COUNTRY_ORDER.length ? (
          <span className="text-[#8a7358]">
            {visibleCodes.length}/{COUNTRY_ORDER.length}
          </span>
        ) : null}
      </div>

      <div
        role="tablist"
        aria-label={t("countries")}
        className="flex flex-wrap items-end gap-[5px]"
      >
        <button
          type="button"
          role="tab"
          aria-selected={path.length === 0 && !editing}
          onClick={onWorld}
          title={t("allSelected")}
          className={`${chip} min-w-[28px] text-[8px] font-bold uppercase tracking-tight ${
            path.length === 0 && !editing
              ? "bg-[#1f3d4d] text-[#f7f3ec]"
              : "bg-[#ebe4d8] text-[#1f3d4d] hover:bg-[#e0d6c6]"
          }`}
        >
          <span className="flex h-[14px] items-center justify-center leading-none">
            {t("all")}
          </span>
          <span className="invisible text-[8px] font-semibold leading-none" aria-hidden>
            XXX
          </span>
        </button>
        {codesToShow.map((code) => {
          const country = COUNTRY_GDP[code];
          const included = visible.has(code);
          const active = !editing && activeCountry === code;
          const compared = !editing && compareCode === code;
          const { source, country: quality } = qualityForCountry(
            code,
            country.sourceKey,
          );
          const contested = Boolean(quality.contested?.length);
          const countryName = label(country.name, country.id);
          const tipParts = [
            `${countryName} (${code})`,
            String(country.periodLabel ?? country.year),
            editing
              ? included
                ? t("included")
                : t("excluded")
              : null,
            contested
              ? t("contestedSeries")
              : quality.measureWarning
                ? source ? badge(source.badge) : null
                : null,
            !editing && compared
              ? t("clearCompare")
              : !editing && selectingCompare && activeCountry && !active
                ? t("comparePick")
                : !editing && compareCode && activeCountry && !active
                  ? t("compareSwitch")
                  : null,
          ].filter(Boolean);
          return (
            <button
              key={code}
              type="button"
              role={editing ? "checkbox" : "tab"}
              aria-checked={editing ? included : undefined}
              aria-selected={!editing ? active || compared : undefined}
              aria-label={
                editing
                  ? `${included ? t("exclude") : t("include")} ${countryName}`
                  : `${countryName} (${code})`
              }
              onClick={() => {
                if (editing) onToggle(code);
                else if (included) onCountry(code);
              }}
              title={tipParts.join(" · ")}
              className={`${chip} ${
                editing
                  ? included
                    ? "bg-[#ebe4d8] ring-1 ring-[#1f3d4d]"
                    : "bg-transparent opacity-40 grayscale"
                  : active
                    ? "bg-[#ebe4d8] ring-1 ring-[#1f3d4d]"
                    : compared
                      ? "bg-[#e7eef1] ring-1 ring-[#2a6f97]"
                      : "hover:bg-[#f0ebe3]"
              }`}
            >
              <FlagIcon
                iso3={code}
                className="h-[14px] w-[21px] overflow-hidden rounded-[2px]"
                title={countryName}
              />
              <span
                className={`text-[8px] font-semibold leading-none tracking-wide ${
                  (active || compared) && !editing ? "text-[#1f3d4d]" : "text-[#5c6b73]"
                }`}
              >
                {code}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ComparabilityNotice({
  node,
  visibleCodes,
}: {
  node: ChartNode;
  visibleCodes: readonly string[];
}) {
  const { t, label, list, ja, contested: localizeContest } = useI18n();
  if (node.id !== "world") {
    const country = countryForNode(node);
    if (!country?.code) return null;
    const gdpContest = contestedFor(country.code, "gdp");
    if (!gdpContest) return null;
    return (
      <div
        className="rounded-md border border-[#e0c4b4] bg-[#fff4ec] px-3 py-2 text-xs leading-relaxed text-[#5c6b73]"
        role="note"
      >
        <span className="font-medium text-[#1f3d4d]">
          {t("contested")}
          {": "}
          {label(country.name, country.id)}
          {t("selfReported")}
        </span>
        <span className="mt-1 block">{localizeContest(gdpContest).why}</span>
      </div>
    );
  }

  const visible = new Set(visibleCodes);
  const volume = COUNTRY_ORDER.filter((code) => {
    if (!visible.has(code)) return false;
    const q = qualityForCountry(code, COUNTRY_GDP[code].sourceKey);
    return q.source?.measureClass === "chain-volume";
  }).map((c) => label(COUNTRY_GDP[c].name, COUNTRY_GDP[c].id));
  const gva = COUNTRY_ORDER.filter((code) => {
    if (!visible.has(code)) return false;
    const q = qualityForCountry(code, COUNTRY_GDP[code].sourceKey);
    return q.source?.measureClass === "nominal-gva";
  }).map((c) => label(COUNTRY_GDP[c].name, COUNTRY_GDP[c].id));
  const contestedNames = COUNTRY_ORDER.filter((code) => {
    if (!visible.has(code)) return false;
    const q = qualityForCountry(code, COUNTRY_GDP[code].sourceKey);
    return (q.country.contested?.length ?? 0) > 0;
  }).map((c) => label(COUNTRY_GDP[c].name, COUNTRY_GDP[c].id));

  return (
    <div
      className="rounded-md border border-[#e0d6c6] bg-[#fbf8f2] px-3 py-2 text-xs leading-relaxed text-[#5c6b73]"
      role="note"
    >
      <p>
        <span className="font-medium text-[#1f3d4d]">{t("comparability")}</span>
        {t("comparabilityBody")}
        {gva.length ? list(gva) : t("noneSelected")}
        {t("chainVolume")}
        {volume.length ? list(volume) : t("noneSelected")}
        {ja ? "。" : "."}
      </p>
      {contestedNames.length > 0 ? (
        <p className="mt-1.5">
          <span className="font-medium text-[#c45c26]">{t("contestedLead")}</span>
          {list(contestedNames)}
          {t("contestedTail")}
        </p>
      ) : null}
    </div>
  );
}

function StaleDataNotice() {
  const { t, ja } = useI18n();
  if (!isSnapshotStale()) return null;
  const fetchedLabel = new Date(GDP_DATA_META.fetchedAt).toLocaleDateString(
    ja ? "ja-JP" : "en-CA",
  );
  return (
    <p
      className="rounded-md border border-[#c45c26]/35 bg-[#fff4ec] px-3 py-2 text-xs leading-relaxed text-[#8a3c18]"
      role="status"
    >
      <span className="font-semibold uppercase tracking-wide">{t("stale")}</span>
      {t("staleBody")} {fetchedLabel} {t("staleTail")}{" "}
      <code className="rounded bg-[#ffe8d8] px-1 py-0.5 text-[11px] text-[#1f3d4d]">
        npm run fetch:gdp
      </code>{" "}
      {t("staleEnd")}
    </p>
  );
}

function YearLagNotice({
  node,
  visibleCodes,
}: {
  node: ChartNode;
  visibleCodes: readonly string[];
}) {
  const { t, label, ja } = useI18n();
  const maxYear = GDP_DATA_META.maxYear;
  const visible = new Set(visibleCodes);
  const staleCountries = COUNTRY_ORDER.map((code) => COUNTRY_GDP[code]).filter(
    (c) => c.code != null && visible.has(c.code) && c.year < maxYear,
  );

  // At world level: list every lagging country
  if (node.id === "world" && staleCountries.length > 0) {
    return (
      <p
        className="rounded-md border border-[#e0d6c6] bg-[#fbf8f2] px-3 py-2 text-xs leading-relaxed text-[#5c6b73]"
        role="note"
      >
        {t("latestLead")}{" "}
        {staleCountries.map((c) => (
          <span key={c.code}>
            <span className="font-medium text-[#1f3d4d]">{label(c.name, c.id)}</span>{" "}
            {t("isWord")} {c.periodLabel ?? c.year}
            {c !== staleCountries[staleCountries.length - 1] ? (ja ? "、" : "; ") : ja ? "。" : ". "}
          </span>
        ))}
        {t("newer")}
      </p>
    );
  }

  // Inside a country that lags the freshest country in the set
  const country =
    node.id === "world"
      ? null
      : COUNTRY_ORDER.map((c) => COUNTRY_GDP[c]).find(
          (c) => c.id === node.id || node.id.startsWith(`${c.id}-`),
        );

  if (country && country.year < maxYear) {
    return (
      <p
        className="rounded-md border border-[#e8dcc8] bg-[#fff8ee] px-3 py-2 text-xs leading-relaxed text-[#8a7358]"
        role="note"
      >
        {t("showingLatest")} {label(country.name, country.id)} (
        {country.periodLabel ?? country.year}). {t("othersUpTo")} {maxYear}. {t("seriesNotUpdated")}
      </p>
    );
  }

  return null;
}

function LevelSummary({ node }: { node: ChartNode }) {
  const { t, money, perCapitaUsd, delta } = useI18n();
  const drillable = (node.children ?? []).filter(hasChildren).length;
  const n = node.children?.length ?? 0;
  const period =
    node.periodLabel ?? (node.year != null ? String(node.year) : null);
  const isWorld = node.id === "world";
  const country = countryForNode(node);
  const interestLine = country ? afterInterestText(country, t, perCapitaUsd) : null;

  const measureLabel = isWorld
    ? t("combined")
    : country?.sourceKey === "statcan" || country?.sourceKey === "abs"
      ? t("gdpVa")
      : country?.sourceKey === "bea" || country?.sourceKey === "esri"
        ? t("gdpByIndustry")
        : country?.sourceKey === "eurostat" || country?.sourceKey === "oecd"
          ? t("gva")
          : country?.sourceKey === "worldbank"
            ? t("gdpSector")
            : t("gva");

  const { source } = country
    ? qualityForCountry(country.code ?? "", country.sourceKey)
    : { source: null };
  const gdpContest = country?.code
    ? contestedFor(country.code, "gdp")
    : undefined;
  const gdpDelta = country ? gdpTotalFiveYearDelta(country) : null;
  const inflationDrag = country ? inflationFiveYearDrag(country) : null;
  const realGdp = country ? realGdpFiveYearDelta(country) : null;

  return (
    <div className="flex min-w-0 max-w-full flex-wrap items-baseline gap-x-4 gap-y-1 text-sm text-[#5c6b73]">
      <span className="inline-flex flex-wrap items-center gap-2">
        {measureLabel}{" "}
        <span className="font-semibold tabular-nums text-[#1f3d4d]">
          {money(node.amountMillions)}
        </span>
        {t("usd") ? <span className="text-[#8a7358]">{t("usd")}</span> : null}
        {gdpDelta ? (
          <span
            className={`text-[11px] font-medium tabular-nums ${fiveYearDeltaClass(gdpDelta.tone)}`}
            title={t("nominalTitle")}
          >
            {delta(gdpDelta.text)}
          </span>
        ) : null}
        {inflationDrag ? (
          <span
            className={`text-[11px] font-medium tabular-nums ${fiveYearDeltaClass(inflationDrag.tone)}`}
            title={
              country?.cpiPrior5yYear != null && country?.cpiYear != null
                ? `${t("cpiPrefix")}${country.cpiPrior5yYear}→${country.cpiYear}`
                : t("cpiDrag")
            }
          >
            {t("infl")} {delta(inflationDrag.text)}
          </span>
        ) : null}
        {realGdp ? (
          <span
            className={`text-[11px] font-semibold tabular-nums ${fiveYearDeltaClass(realGdp.tone)}`}
            title={t("realTitle")}
          >
            {t("realWord")} {delta(realGdp.text)}
          </span>
        ) : null}
        {source ? <MeasureBadge source={source} /> : null}
        {gdpContest ? <ContestedTooltip field={gdpContest} /> : null}
      </span>
      {country?.gdpPerCapitaUsd != null ? (
        <span>
          {t("perCapita")}{" "}
          <span className="font-semibold tabular-nums text-[#1f3d4d]">
            {perCapitaUsd(country.gdpPerCapitaUsd)}
          </span>
          {interestLine ? (
            <span className="ml-1.5 text-[11px] tabular-nums text-[#5c6b73]">{interestLine}</span>
          ) : null}
        </span>
      ) : null}
      {country?.bondYield10y != null ? (
        <span>
          {t("yieldShort")}{" "}
          <span className="font-semibold tabular-nums text-[#1f3d4d]">
            {country.bondYield10y.toFixed(2)}%
          </span>
          {country.bondYield10yPeriod ? (
            <span className="text-xs tabular-nums text-[#8a7358]">
              {" "}
              · {country.bondYield10yPeriod}
            </span>
          ) : null}
        </span>
      ) : null}
      {period ? (
        <span className="text-xs tabular-nums">{t("asOf")} {period}</span>
      ) : null}
      <span>
        {isWorld
          ? `${n} ${t("countriesCount")}`
          : `${n} ${t("categories")}${drillable > 0 ? ` · ${drillable} ${t("withSubsectors")}` : ""}`}
      </span>
    </div>
  );
}

function PathCrumb({
  root,
  path,
  onWorld,
  onNavigate,
}: {
  root: ChartNode;
  path: string[];
  onWorld: () => void;
  onNavigate: (path: string[]) => void;
}) {
  const { t, label } = useI18n();
  if (path.length === 0) return null;
  return (
    <nav aria-label={t("breadcrumb")} className="flex min-h-7 flex-wrap items-center gap-1 text-sm">
      <button
        type="button"
        className="text-[#2a6f97] hover:underline"
        onClick={onWorld}
      >
        {label(root.name, root.id)}
      </button>
      {path.map((id, index) => {
        let node: ChartNode;
        try {
          node = nodeAtPath(root, path.slice(0, index + 1));
        } catch {
          return null;
        }
        const isLast = index === path.length - 1;
        const nodeName = label(node.name, node.id);
        return (
          <span key={id} className="flex items-center gap-1 text-[#5c6b73]">
            <span aria-hidden>/</span>
            {isLast ? (
              <span className="text-[#1f3d4d]">{nodeName}</span>
            ) : (
              <button
                type="button"
                className="text-[#2a6f97] hover:underline"
                onClick={() => onNavigate(path.slice(0, index + 1))}
              >
                {nodeName}
              </button>
            )}
          </span>
        );
      })}
    </nav>
  );
}

function IndustryChart({
  root,
  node,
  path,
  hoveredId,
  onHover,
  onOpenPath,
  canGoBack,
  onBack,
  onRemoveCountry,
  comparing,
}: {
  root: ChartNode;
  node: ChartNode;
  path: string[];
  hoveredId: string | null;
  onHover: (id: string | null) => void;
  onOpenPath: (path: string[]) => void;
  canGoBack: boolean;
  onBack: () => void;
  onRemoveCountry?: (code: string) => void;
  comparing: boolean;
}) {
  const chart = useMemo(() => buildPieChart(node), [node]);
  const contextParent: ChartNode | null = (() => {
    if (path.length === 0) return null;
    if (path.length === 1) return root;
    try {
      return nodeAtPath(root, path.slice(0, -1));
    } catch {
      return null;
    }
  })();
  const economy = countryForNode(node);

  return (
    <div
      className={
        comparing
          ? "grid w-full min-w-0 grid-cols-1 items-start gap-4 @min-[40rem]:grid-cols-[minmax(0,1fr)_minmax(0,15rem)]"
          : "grid w-full min-w-0 items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,20rem)]"
      }
    >
      <DrilldownPie
        node={node}
        labelMode={path.length === 0 ? "country" : "sector"}
        hoveredId={hoveredId}
        onHover={onHover}
        onSelect={(id) => onOpenPath([...path, id])}
        canGoBack={canGoBack}
        onBack={onBack}
      />
      <div className="flex min-w-0 flex-col gap-4">
        {contextParent ? (
          <ContextPie
            root={contextParent}
            section={node}
            hoveredId={hoveredId}
            totalLabel={contextParent.name}
            economy={economy}
          />
        ) : null}
        <ul
          className={`flex min-w-0 flex-col gap-0.5 overflow-y-auto overscroll-contain pr-1 [scrollbar-gutter:stable] ${
            comparing ? "max-h-[420px]" : "max-h-[520px]"
          }`}
        >
          {chart.legend.map((slice) => (
            <SliceRow
              key={slice.id}
              slice={slice}
              active={hoveredId === slice.id}
              drillable={hasChildren(slice)}
              showRemove={path.length === 0 && Boolean(slice.code)}
              onHover={onHover}
              onOpen={() => onOpenPath([...path, slice.id])}
              onRemove={
                slice.code && onRemoveCountry
                  ? () => onRemoveCountry(slice.code as string)
                  : undefined
              }
            />
          ))}
        </ul>
      </div>
    </div>
  );
}

function CompareColumn({
  root,
  path,
  hoveredId,
  onHover,
  onOpenPath,
  onBack,
  onWorld,
  onRemove,
  divided,
}: {
  root: ChartNode;
  path: string[];
  hoveredId: string | null;
  onHover: (id: string | null) => void;
  onOpenPath: (path: string[]) => void;
  onBack: () => void;
  onWorld: () => void;
  onRemove: () => void;
  divided: boolean;
}) {
  const { t, label } = useI18n();
  const node = useMemo(() => {
    try {
      return nodeAtPath(root, path);
    } catch {
      return root;
    }
  }, [root, path]);
  const country = countryForNode(node);
  const countryName = country ? label(country.name, country.id) : label(node.name, node.id);

  return (
    <section
      className={`@container flex w-full min-w-0 max-w-full flex-col gap-3 overflow-hidden ${
        divided ? "lg:border-l lg:border-[#e0d6c6] lg:pl-6" : ""
      }`}
      aria-label={countryName}
    >
      <div className="flex min-h-8 items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-[#1f3d4d]">
          {country?.code ? (
            <FlagIcon
              iso3={country.code}
              className="h-[14px] w-[21px] overflow-hidden rounded-[2px]"
              title={countryName}
            />
          ) : null}
          {countryName}
        </h2>
        <button
          type="button"
          onClick={onRemove}
          className="shrink-0 text-xs font-medium text-[#2a6f97] hover:underline"
        >
          {t("clearCompare")}
        </button>
      </div>
      <PathCrumb root={root} path={path} onWorld={onWorld} onNavigate={onOpenPath} />
      <LevelSummary node={node} />
      <IndustryChart
        root={root}
        node={node}
        path={path}
        hoveredId={hoveredId}
        onHover={onHover}
        onOpenPath={onOpenPath}
        canGoBack={path.length > 1}
        onBack={onBack}
        comparing
      />
    </section>
  );
}

export default function GdpExplorer() {
  const { t, ja } = useI18n();
  const [visibleCodes, setVisibleCodes] = useState<string[]>(allCountryCodes);
  const [editingList, setEditingList] = useState(false);
  const [path, setPath] = useState<string[]>([]);
  const [comparePath, setComparePath] = useState<string[]>([]);
  const [compareMode, setCompareMode] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [compareHoveredId, setCompareHoveredId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const codes = loadVisibleCodes();
    setVisibleCodes(codes);
    const savedPath = loadPath();
    let restoredPrimary: string | null = null;
    if (savedPath.length > 0) {
      const open = COUNTRY_ORDER.find(
        (code) => COUNTRY_GDP[code].id === savedPath[0],
      );
      if (open && codes.includes(open)) {
        setPath(savedPath);
        restoredPrimary = savedPath[0];
      }
    }
    const savedCompare = loadComparePath();
    let restoredPair = false;
    if (restoredPrimary && savedCompare.length > 0 && savedCompare[0] !== restoredPrimary) {
      const other = COUNTRY_ORDER.find(
        (code) => COUNTRY_GDP[code].id === savedCompare[0],
      );
      if (other && codes.includes(other)) {
        setComparePath(savedCompare);
        restoredPair = true;
      }
    }
    if (loadCompareMode() || restoredPair) setCompareMode(true);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(
        VISIBLE_STORAGE_KEY,
        JSON.stringify(visibleCodes),
      );
    } catch {
      /* ignore quota / private mode */
    }
  }, [visibleCodes, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(PATH_STORAGE_KEY, JSON.stringify(path));
    } catch {
      /* ignore quota / private mode */
    }
  }, [path, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(COMPARE_STORAGE_KEY, JSON.stringify(comparePath));
      window.localStorage.setItem(COMPARE_MODE_KEY, compareMode ? "1" : "0");
    } catch {
      /* ignore quota / private mode */
    }
  }, [comparePath, compareMode, hydrated]);

  const root = useMemo(
    () => buildFilteredWorld(visibleCodes),
    [visibleCodes],
  );

  // Drop path segments that no longer exist after a data refresh / filter
  useEffect(() => {
    if (!hydrated || path.length === 0) return;
    let node: ChartNode = root;
    for (let i = 0; i < path.length; i++) {
      const next = node.children?.find((c) => c.id === path[i]);
      if (!next) {
        setPath(path.slice(0, i));
        setHoveredId(null);
        return;
      }
      node = next;
    }
  }, [root, path, hydrated]);

  // If the open country was excluded, keep the comparison country or return to the world pie
  useEffect(() => {
    if (!hydrated || path.length === 0) return;
    const open = COUNTRY_ORDER.find((code) => COUNTRY_GDP[code].id === path[0]);
    if (open && visibleCodes.includes(open)) return;
    const second =
      comparePath.length > 0
        ? COUNTRY_ORDER.find((code) => COUNTRY_GDP[code].id === comparePath[0])
        : null;
    if (second && visibleCodes.includes(second)) {
      setPath(comparePath);
      setComparePath([]);
      setHoveredId(null);
      setCompareHoveredId(null);
      return;
    }
    setPath([]);
    setComparePath([]);
    setHoveredId(null);
    setCompareHoveredId(null);
  }, [visibleCodes, path, comparePath, hydrated]);

  useEffect(() => {
    if (!hydrated || comparePath.length === 0) return;
    if (path.length === 0 || path[0] === comparePath[0]) {
      setComparePath([]);
      setCompareHoveredId(null);
      return;
    }
    const open = COUNTRY_ORDER.find((code) => COUNTRY_GDP[code].id === comparePath[0]);
    if (!open || !visibleCodes.includes(open)) {
      setComparePath([]);
      setCompareHoveredId(null);
      return;
    }
    let node: ChartNode = root;
    for (let i = 0; i < comparePath.length; i++) {
      const next = node.children?.find((c) => c.id === comparePath[i]);
      if (!next) {
        setComparePath(comparePath.slice(0, i));
        setCompareHoveredId(null);
        return;
      }
      node = next;
    }
  }, [root, comparePath, path, visibleCodes, hydrated]);

  const current = useMemo(() => {
    try {
      return nodeAtPath(root, path);
    } catch {
      return root;
    }
  }, [root, path]);
  const compareCurrent = useMemo(() => {
    if (comparePath.length === 0) return null;
    try {
      return nodeAtPath(root, comparePath);
    } catch {
      return null;
    }
  }, [root, comparePath]);
  const activeCountry = countryForNode(current);
  const compareCountry = compareCurrent ? countryForNode(compareCurrent) : null;
  const comparing = comparePath.length > 0;
  const splitView = compareMode && path.length > 0;
  const compareCode =
    comparePath.length > 0
      ? (COUNTRY_ORDER.find((code) => COUNTRY_GDP[code].id === comparePath[0]) ?? null)
      : null;

  function clearCompare() {
    setComparePath([]);
    setCompareHoveredId(null);
  }

  function removePrimary() {
    setPath(comparePath);
    setHoveredId(compareHoveredId);
    setComparePath([]);
    setCompareHoveredId(null);
  }

  function exitCompare() {
    setCompareMode(false);
    setComparePath([]);
    setCompareHoveredId(null);
  }

  function goWorld() {
    setPath([]);
    setComparePath([]);
    setHoveredId(null);
    setCompareHoveredId(null);
  }

  function goCountry(code: string) {
    if (!visibleCodes.includes(code)) return;
    const country = COUNTRY_GDP[code] as CountryGdpTree;
    const primary =
      path.length > 0
        ? COUNTRY_ORDER.find((c) => COUNTRY_GDP[c].id === path[0])
        : null;
    if (!compareMode || !primary) {
      setPath([country.id]);
      setHoveredId(null);
      setComparePath([]);
      setCompareHoveredId(null);
      return;
    }
    if (primary === code) {
      setPath([country.id]);
      setHoveredId(null);
      return;
    }
    if (compareCode === code) {
      clearCompare();
      return;
    }
    setComparePath([country.id]);
    setCompareHoveredId(null);
  }

  function toggleCountry(code: string) {
    setVisibleCodes((prev) => {
      if (prev.includes(code)) {
        if (prev.length <= 1) return prev;
        return prev.filter((c) => c !== code);
      }
      const next = [...prev, code];
      next.sort(
        (a, b) => COUNTRY_ORDER.indexOf(a as (typeof COUNTRY_ORDER)[number]) -
          COUNTRY_ORDER.indexOf(b as (typeof COUNTRY_ORDER)[number]),
      );
      return next;
    });
  }

  return (
    <div className={`mx-auto flex w-full min-w-0 max-w-full flex-col gap-6 ${splitView ? "max-w-[96rem]" : "max-w-5xl"}`}>
      <header className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="text-3xl font-semibold tracking-tight text-[#1f3d4d] sm:text-4xl">
              {t("title")}
            </h1>
            <p className="max-w-2xl text-sm leading-relaxed text-[#5c6b73]">
              {t("introLead")}
              <span className="font-medium text-[#1f3d4d]">{t("introEdit")}</span>
              {t("introTail")}
            </p>
          </div>
          <YoshinobuButton />
        </div>
        <ScopeTabs
          path={path}
          compareCode={compareCode}
          selectingCompare={compareMode}
          visibleCodes={visibleCodes}
          editing={editingList}
          onWorld={goWorld}
          onCountry={goCountry}
          onToggle={toggleCountry}
          onEditingChange={setEditingList}
          onSelectAll={() => setVisibleCodes(allCountryCodes())}
          onResetDefault={() => setVisibleCodes(allCountryCodes())}
        />
        {!editingList && (path.length > 0 || compareMode) ? (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              aria-pressed={compareMode}
              onClick={() => (compareMode ? exitCompare() : setCompareMode(true))}
              className={`inline-flex items-center rounded-md border px-3 py-1.5 text-sm font-semibold transition ${
                compareMode
                  ? "border-[#1f3d4d] bg-[#1f3d4d] text-[#f7f3ec]"
                  : "border-[#1f3d4d] bg-[#fbf8f2] text-[#1f3d4d] hover:bg-[#ebe4d8]"
              }`}
            >
              {compareMode ? t("exitCompare") : t("compare")}
            </button>
            {compareMode && path.length > 0 ? (
              <span className="text-[11px] leading-relaxed text-[#8a7358]">
                {comparing ? t("comparingHint") : t("comparePick")}
              </span>
            ) : null}
          </div>
        ) : null}
        <StaleDataNotice />
        {splitView ? null : (
          <>
            <LevelSummary node={current} />
            {activeCountry ? <DemographicsBanner country={activeCountry} /> : null}
            <PathCrumb
              root={root}
              path={path}
              onWorld={goWorld}
              onNavigate={(next) => {
                setPath(next);
                setHoveredId(null);
              }}
            />
          </>
        )}
      </header>

      <div className="flex w-full min-w-0 flex-col gap-4">
        {splitView ? (
          <>
            {comparing && activeCountry && compareCountry ? (
              <CompareMetrics left={activeCountry} right={compareCountry} />
            ) : !comparing && activeCountry ? (
              <DemographicsBanner country={activeCountry} />
            ) : null}
            <div className="grid w-full min-w-0 grid-cols-1 items-start gap-8 lg:grid-cols-2">
              <CompareColumn
                root={root}
                path={path}
                hoveredId={hoveredId}
                onHover={setHoveredId}
                onOpenPath={(next) => {
                  setPath(next);
                  setHoveredId(null);
                }}
                onBack={() => {
                  setPath((prev) => prev.slice(0, -1));
                  setHoveredId(null);
                }}
                onWorld={goWorld}
                onRemove={removePrimary}
                divided={false}
              />
              {comparing ? (
                <CompareColumn
                  root={root}
                  path={comparePath}
                  hoveredId={compareHoveredId}
                  onHover={setCompareHoveredId}
                  onOpenPath={(next) => {
                    setComparePath(next);
                    setCompareHoveredId(null);
                  }}
                  onBack={() => {
                    setComparePath((prev) => prev.slice(0, -1));
                    setCompareHoveredId(null);
                  }}
                  onWorld={goWorld}
                  onRemove={clearCompare}
                  divided
                />
              ) : (
                <section
                  className="flex min-h-64 items-center justify-center rounded-md border border-dashed border-[#d4c8b4] bg-[#f7f3ec] px-6 py-16 text-center lg:min-h-[28rem]"
                  aria-live="polite"
                >
                  <p className="max-w-xs text-sm leading-relaxed text-[#5c6b73]">
                    <span className="block text-base font-semibold text-[#1f3d4d]">
                      {t("selectToCompare")}
                    </span>
                    <span className="mt-1 block">{t("comparePick")}</span>
                  </p>
                </section>
              )}
            </div>
          </>
        ) : (
          <IndustryChart
            root={root}
            node={current}
            path={path}
            hoveredId={hoveredId}
            onHover={setHoveredId}
            onOpenPath={(next) => {
              setPath(next);
              setHoveredId(null);
            }}
            canGoBack={path.length > 0}
            onBack={() => {
              setHoveredId(null);
              if (path.length <= 1) goWorld();
              else setPath(path.slice(0, -1));
            }}
            onRemoveCountry={toggleCountry}
            comparing={false}
          />
        )}

        <div className="flex w-full flex-col gap-3">
          {comparing && compareCurrent ? (
            <>
              <YearLagNotice node={current} visibleCodes={visibleCodes} />
              <YearLagNotice node={compareCurrent} visibleCodes={visibleCodes} />
              <ComparabilityNotice node={current} visibleCodes={visibleCodes} />
              <ComparabilityNotice node={compareCurrent} visibleCodes={visibleCodes} />
            </>
          ) : (
            <>
              <YearLagNotice
                node={current.id === "world" ? root : current}
                visibleCodes={visibleCodes}
              />
              <ComparabilityNotice
                node={current.id === "world" ? root : current}
                visibleCodes={visibleCodes}
              />
            </>
          )}
        </div>
      </div>

      <footer className="border-t border-[#e0d6c6] pt-4 text-xs leading-relaxed text-[#5c6b73]">
        <p>
          {t("sources")}{" "}
          <a
            className="text-[#2a6f97] hover:underline"
            href={GDP_DATA_META.sources.bea.url}
            target="_blank"
            rel="noreferrer"
          >
            {t("srcBea")}
          </a>
          {ja ? "、" : ", "}
          <a
            className="text-[#2a6f97] hover:underline"
            href={GDP_DATA_META.sources.esri.url}
            target="_blank"
            rel="noreferrer"
          >
            {t("srcEsri")}
          </a>
          {ja ? "、" : ", "}
          <a
            className="text-[#2a6f97] hover:underline"
            href={GDP_DATA_META.sources.statcan.url}
            target="_blank"
            rel="noreferrer"
          >
            {t("srcStatcan")}
          </a>
          {ja ? "、" : ", "}
          <a
            className="text-[#2a6f97] hover:underline"
            href={GDP_DATA_META.sources.abs.url}
            target="_blank"
            rel="noreferrer"
          >
            {t("srcAbs")}
          </a>
          {ja ? "、" : ", "}
          <a
            className="text-[#2a6f97] hover:underline"
            href={GDP_DATA_META.sources.eurostat.url}
            target="_blank"
            rel="noreferrer"
          >
            {t("srcEurostat")}
          </a>
          {ja ? "、" : ", "}
          <a
            className="text-[#2a6f97] hover:underline"
            href={GDP_DATA_META.sources.worldbank.url}
            target="_blank"
            rel="noreferrer"
          >
            {t("srcWorldbank")}
          </a>
          {ja ? "、" : ", "}
          <a
            className="text-[#2a6f97] hover:underline"
            href={GDP_DATA_META.sources.oecd.url}
            target="_blank"
            rel="noreferrer"
          >
            {t("srcOecd")}
          </a>
          {ja ? "。" : ". "}
          {t("dataAsOf")}{" "}
          {new Date(GDP_DATA_META.fetchedAt).toLocaleDateString(ja ? "ja-JP" : "en-CA")}
          {ja ? "。" : "."}
        </p>
      </footer>
    </div>
  );
}
