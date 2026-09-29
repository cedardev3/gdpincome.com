"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import ContextPie from "@/components/ContextPie";
import { ContestedTooltip, MeasureBadge } from "@/components/DataQuality";
import DrilldownPie from "@/components/DrilldownPie";
import { useI18n, YoshinobuButton } from "@/i18n/locale";
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

function loadPath(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(PATH_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === "string");
  } catch {
    return [];
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
  delta,
  contested,
  emphasize,
  valueTone,
}: {
  label: string;
  value: ReactNode;
  hint: ReactNode;
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
      <p className="mt-0.5 text-[11px] text-[#5c6b73]">{hint}</p>
    </div>
  );
}

function DemographicsBanner({ country }: { country: CountryGdpTree }) {
  const { t, label, people, perCapitaUsd, delta, sourceSummary: summarize, ja, badge } = useI18n();
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

  return (
    <div className="flex flex-col gap-2">
      {source && quality.measureWarning ? (
        <p
          className="rounded-md border border-[#e8dcc8] bg-[#fff8ee] px-3 py-2 text-xs leading-relaxed text-[#8a7358]"
          role="note"
        >
          <span className="font-medium text-[#1f3d4d]">{t("notComparable")}</span>
          {source ? summarize(source.sourceKey, source.summary) : null}
        </p>
      ) : null}
      <div
        className="grid gap-3 rounded-md border border-[#e0d6c6] bg-[#fbf8f2] px-4 py-3 sm:grid-cols-2 lg:grid-cols-4"
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
          label={t("gdpPerCapita")}
          contested={contestedFor(country.code ?? "", "gdpPerCapita")}
          value={perCapitaUsd(country.gdpPerCapitaUsd)}
          delta={showDelta(pcapDelta)}
          hint={
            quality.measureWarning
              ? `${t("derivedFrom")} ${source ? badge(source.badge) : ""} ${t("notPeer")}`
              : pcapDelta
                ? `${t("pcapIndustry")} (${country.populationYear}) · ${t("pcapWb")}`
                : `${t("pcapPlain")} (${country.populationYear})`
          }
        />
      </div>
      <div
        className="grid gap-3 rounded-md border border-[#e0d6c6] bg-[#fbf8f2] px-4 py-3 sm:grid-cols-2 lg:grid-cols-4"
        role="group"
        aria-label={`${countryName} ${t("population")}`}
      >
        <MetricBlock
          label={t("yield")}
          value={yieldPct != null ? `${yieldPct.toFixed(2)}%` : t("empty")}
          delta={showDelta(yieldDelta)}
          hint={`${t("govtBond")}${yieldPeriod ? ` · ${yieldPeriod}` : ""}`}
        />
        <MetricBlock
          label={t("population")}
          contested={contestedFor(country.code ?? "", "population")}
          value={people(country.population)}
          delta={showDelta(popDelta)}
          hint={`${country.population.toLocaleString(ja ? "ja-JP" : "en-US")} · ${country.populationYear}`}
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
      </div>
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
  const tip = [
    sliceName,
    metrics,
    gdp5yr ? `${t("gdp5")}: ${delta(gdp5yr.text)}` : null,
    inflationDrag ? `${t("inflation5")}: ${delta(inflationDrag.text)}` : null,
    realGdp ? `${t("real5")}: ${delta(realGdp.text)}` : null,
    perCapita ? `${t("gdpPerCapita")}: ${perCapita}` : null,
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
          ].filter(Boolean);
          return (
            <button
              key={code}
              type="button"
              role={editing ? "checkbox" : "tab"}
              aria-checked={editing ? included : undefined}
              aria-selected={!editing ? active : undefined}
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
                  active && !editing ? "text-[#1f3d4d]" : "text-[#5c6b73]"
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
        <ContestedTooltip field={gdpContest}>
          <span className="font-medium text-[#1f3d4d]">
            {label(country.name, country.id)}
            {t("selfReported")}
          </span>
        </ContestedTooltip>
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
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm text-[#5c6b73]">
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

export default function GdpExplorer() {
  const { t, label, ja } = useI18n();
  const [visibleCodes, setVisibleCodes] = useState<string[]>(allCountryCodes);
  const [editingList, setEditingList] = useState(false);
  const [path, setPath] = useState<string[]>([]);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const codes = loadVisibleCodes();
    setVisibleCodes(codes);
    const savedPath = loadPath();
    if (savedPath.length > 0) {
      const open = COUNTRY_ORDER.find(
        (code) => COUNTRY_GDP[code].id === savedPath[0],
      );
      if (open && codes.includes(open)) {
        setPath(savedPath);
      }
    }
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

  // If the open country was excluded, return to the world pie
  useEffect(() => {
    if (path.length === 0) return;
    const open = COUNTRY_ORDER.find((code) => COUNTRY_GDP[code].id === path[0]);
    if (open && !visibleCodes.includes(open)) {
      setPath([]);
      setHoveredId(null);
    }
  }, [visibleCodes, path]);

  const current = useMemo(() => {
    try {
      return nodeAtPath(root, path);
    } catch {
      return root;
    }
  }, [root, path]);
  const chart = useMemo(() => buildPieChart(current), [current]);
  const contextParent: ChartNode | null = (() => {
    if (path.length === 0) return null;
    if (path.length === 1) return root;
    try {
      return nodeAtPath(root, path.slice(0, -1));
    } catch {
      return null;
    }
  })();
  const activeCountry = countryForNode(current);

  function goWorld() {
    setPath([]);
    setHoveredId(null);
  }

  function goCountry(code: string) {
    if (!visibleCodes.includes(code)) return;
    const country = COUNTRY_GDP[code] as CountryGdpTree;
    setPath([country.id]);
    setHoveredId(null);
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
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
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
          visibleCodes={visibleCodes}
          editing={editingList}
          onWorld={goWorld}
          onCountry={goCountry}
          onToggle={toggleCountry}
          onEditingChange={setEditingList}
          onSelectAll={() => setVisibleCodes(allCountryCodes())}
          onResetDefault={() => setVisibleCodes(allCountryCodes())}
        />
        <StaleDataNotice />
        <LevelSummary node={current} />
        {activeCountry ? <DemographicsBanner country={activeCountry} /> : null}
        {path.length > 0 ? (
          <nav aria-label={t("breadcrumb")} className="flex flex-wrap items-center gap-1 text-sm">
            <button
              type="button"
              className="text-[#2a6f97] hover:underline"
              onClick={goWorld}
            >
              {label(root.name, root.id)}
            </button>
            {path.map((id, index) => {
              const node = nodeAtPath(root, path.slice(0, index + 1));
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
                      onClick={() => setPath(path.slice(0, index + 1))}
                    >
                      {nodeName}
                    </button>
                  )}
                </span>
              );
            })}
          </nav>
        ) : null}
      </header>

      <div className="flex flex-col gap-4">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,20rem)] lg:items-start">
          <div className="flex flex-col gap-3">
            <DrilldownPie
              node={current}
              labelMode={path.length === 0 ? "country" : "sector"}
              hoveredId={hoveredId}
              onHover={setHoveredId}
              onSelect={(id) => {
                setPath((prev) => [...prev, id]);
                setHoveredId(null);
              }}
              canGoBack={path.length > 0}
              onBack={() => {
                setPath((prev) => prev.slice(0, -1));
                setHoveredId(null);
              }}
            />
          </div>

          <div className="flex flex-col gap-4">
            {contextParent ? (
              <ContextPie
                root={contextParent}
                section={current}
                hoveredId={hoveredId}
                totalLabel={contextParent.name}
                economy={activeCountry}
              />
            ) : null}
            <ul className="flex max-h-[520px] flex-col gap-0.5 overflow-y-auto overscroll-contain pr-1 [scrollbar-gutter:stable]">
              {chart.legend.map((slice) => (
                <SliceRow
                  key={slice.id}
                  slice={slice}
                  active={hoveredId === slice.id}
                  drillable={hasChildren(slice)}
                  showRemove={path.length === 0 && Boolean(slice.code)}
                  onHover={setHoveredId}
                  onOpen={() => {
                    setPath((prev) => [...prev, slice.id]);
                    setHoveredId(null);
                  }}
                  onRemove={
                    slice.code
                      ? () => toggleCountry(slice.code as string)
                      : undefined
                  }
                />
              ))}
            </ul>
          </div>
        </div>

        <div className="flex w-full flex-col gap-3">
          <YearLagNotice
            node={current.id === "world" ? root : current}
            visibleCodes={visibleCodes}
          />
          <ComparabilityNotice
            node={current.id === "world" ? root : current}
            visibleCodes={visibleCodes}
          />
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
