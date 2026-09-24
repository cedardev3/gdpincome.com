"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import ContextPie from "@/components/ContextPie";
import { ContestedTooltip, MeasureBadge } from "@/components/DataQuality";
import DrilldownPie from "@/components/DrilldownPie";
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
  formatMillions,
  formatPercent,
  formatPopulation,
  fiveYearDelta,
  fiveYearDeltaClass,
  formatUsdPerCapita,
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
function sourceSummary(sources: SourceLink[] | undefined): string {
  if (!sources?.length) return "";
  return sources.map((s) => s.label).join(" · ");
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
  if (country.gdpPerCapitaUsd == null || country.population == null) return null;
  const under18 = country.pctUnder18Proxy;
  const over65 = country.pct65Plus;
  const underLabel = country.under18ProxyLabel ?? "Ages 0–14";
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
          <span className="font-medium text-[#1f3d4d]">Not apples-to-apples: </span>
          {source.summary}
        </p>
      ) : null}
      <div
        className="grid gap-3 rounded-md border border-[#e0d6c6] bg-[#fbf8f2] px-4 py-3 sm:grid-cols-2 lg:grid-cols-4"
        role="group"
        aria-label={`${country.name} 5-year GDP vs inflation`}
      >
        <MetricBlock
          label="GDP (5yr)"
          emphasize
          value={gdp5yr?.text ?? "—"}
          valueTone={gdp5yr?.tone ?? null}
          delta={null}
          hint="Nominal · World Bank GDP/capita × population"
        />
        <MetricBlock
          label="Inflation (5yr)"
          emphasize
          value={inflationDrag?.text ?? "—"}
          valueTone={inflationDrag?.tone ?? null}
          delta={null}
          hint={
            country.cpiPrior5yYear != null && country.cpiYear != null
              ? `CPI drag · WB FP.CPI.TOTL · ${country.cpiPrior5yYear}→${country.cpiYear}`
              : "Cumulative CPI shown as a negative drag on growth"
          }
        />
        <MetricBlock
          label="Real GDP (5yr)"
          emphasize
          value={realGdp?.text ?? "—"}
          valueTone={realGdp?.tone ?? null}
          delta={null}
          hint="Nominal growth − inflation"
        />
        <MetricBlock
          label="GDP per capita"
          contested={contestedFor(country.code ?? "", "gdpPerCapita")}
          value={formatUsdPerCapita(country.gdpPerCapitaUsd)}
          delta={pcapDelta}
          hint={
            quality.measureWarning
              ? `Derived from ${source?.badge ?? "this measure"} ÷ population — not comparable to nominal USD peers`
              : pcapDelta
                ? `USD · industry ÷ pop (${country.populationYear}) · % change uses World Bank GDP/capita`
                : `USD · industry GDP ÷ population (${country.populationYear})`
          }
        />
      </div>
      <div
        className="grid gap-3 rounded-md border border-[#e0d6c6] bg-[#fbf8f2] px-4 py-3 sm:grid-cols-2 lg:grid-cols-4"
        role="group"
        aria-label={`${country.name} population, yields, and age structure`}
      >
        <MetricBlock
          label="10-year yield"
          value={yieldPct != null ? `${yieldPct.toFixed(2)}%` : "—"}
          delta={yieldDelta}
          hint={`Govt bond · OECD IRLT${yieldPeriod ? ` · ${yieldPeriod}` : ""}`}
        />
        <MetricBlock
          label="Population"
          contested={contestedFor(country.code ?? "", "population")}
          value={formatPopulation(country.population)}
          delta={popDelta}
          hint={`${country.population.toLocaleString("en-US")} · ${country.populationYear}`}
        />
        <MetricBlock
          label="Under 18"
          contested={contestedFor(country.code ?? "", "ageStructure")}
          value={under18 != null ? `${under18}%` : "—"}
          delta={underDelta}
          hint={`${underLabel} share of population${
            country.pctUnder15Year != null ? ` · ${country.pctUnder15Year}` : ""
          }`}
        />
        <MetricBlock
          label="Ages 65+"
          contested={contestedFor(country.code ?? "", "ageStructure")}
          value={over65 != null ? `${over65}%` : "—"}
          delta={overDelta}
          hint={`Share of population${
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
  const metrics = `${formatMillions(slice.amountMillions)} · ${formatPercent(slice.percent)}`;
  const perCapita =
    "gdpPerCapitaUsd" in slice && typeof slice.gdpPerCapitaUsd === "number"
      ? formatUsdPerCapita(slice.gdpPerCapitaUsd)
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
    slice.name,
    metrics,
    gdp5yr ? `GDP 5yr: ${gdp5yr.text}` : null,
    inflationDrag ? `Inflation 5yr: ${inflationDrag.text}` : null,
    realGdp ? `Real GDP 5yr: ${realGdp.text}` : null,
    perCapita ? `GDP per capita: ${perCapita}` : null,
    bondYield ? `10y bond yield: ${bondYield}` : null,
    contestedPop ? `Population: contested official series — see country view` : null,
    measureQ?.source && !measureQ.source.levelComparableToNominalUsd
      ? measureQ.source.summary
      : null,
    period ? `Period: ${period}` : null,
    sourceSummary(slice.sources),
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
        {slice.name}
        {contestedPop ? (
          <span className="ml-1.5 text-[9px] uppercase tracking-wide text-[#c45c26]">
            contested
          </span>
        ) : measureQ?.source && !measureQ.source.levelComparableToNominalUsd ? (
          <span className="ml-1.5 text-[9px] uppercase tracking-wide text-[#8a7358]">
            {measureQ.source.badge}
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
            {gdp5yr.text}
          </span>
        ) : null}
        {inflationDrag ? (
          <span
            className={`block text-[10px] font-medium ${fiveYearDeltaClass(inflationDrag.tone)}`}
          >
            infl {inflationDrag.text}
          </span>
        ) : null}
        {realGdp ? (
          <span
            className={`block text-[10px] font-medium ${fiveYearDeltaClass(realGdp.tone)}`}
          >
            real {realGdp.text}
          </span>
        ) : null}
        {perCapita || bondYield ? (
          <span className="block text-[10px] text-[#8a7358]">
            {[perCapita ? `${perCapita}/cap` : null, bondYield ? `${bondYield} 10y` : null]
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
          aria-label={`${slice.name}, open details`}
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
          aria-label={`Remove ${slice.name} from comparison`}
          title={`Remove ${slice.name}`}
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
          {editing ? "Done" : "Edit list"}
        </button>
        {editing ? (
          <>
            <button
              type="button"
              onClick={onSelectAll}
              className="font-medium text-[#2a6f97] hover:underline"
            >
              Select all
            </button>
            <button
              type="button"
              onClick={onResetDefault}
              className="font-medium text-[#2a6f97] hover:underline"
            >
              Reset
            </button>
            <span className="text-[#8a7358]">
              Tap flags · {visibleCodes.length} on
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
        aria-label="Countries"
        className="flex flex-wrap items-end gap-[5px]"
      >
        <button
          type="button"
          role="tab"
          aria-selected={path.length === 0 && !editing}
          onClick={onWorld}
          title="All selected countries"
          className={`${chip} min-w-[28px] text-[8px] font-bold uppercase tracking-tight ${
            path.length === 0 && !editing
              ? "bg-[#1f3d4d] text-[#f7f3ec]"
              : "bg-[#ebe4d8] text-[#1f3d4d] hover:bg-[#e0d6c6]"
          }`}
        >
          <span className="flex h-[14px] items-center justify-center leading-none">
            All
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
          const tipParts = [
            `${country.name} (${code})`,
            String(country.periodLabel ?? country.year),
            editing
              ? included
                ? "Included — tap to remove"
                : "Excluded — tap to add"
              : null,
            contested
              ? "Contested official series"
              : quality.measureWarning
                ? source?.badge
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
                  ? `${included ? "Exclude" : "Include"} ${country.name}`
                  : `${country.name} (${code})`
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
                title={country.name}
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
            {country.name} GDP is self-reported official data
          </span>
        </ContestedTooltip>
        <span className="mt-1 block">{gdpContest.why}</span>
      </div>
    );
  }

  const visible = new Set(visibleCodes);
  const volume = COUNTRY_ORDER.filter((code) => {
    if (!visible.has(code)) return false;
    const q = qualityForCountry(code, COUNTRY_GDP[code].sourceKey);
    return q.source?.measureClass === "chain-volume";
  }).map((c) => COUNTRY_GDP[c].name);
  const gva = COUNTRY_ORDER.filter((code) => {
    if (!visible.has(code)) return false;
    const q = qualityForCountry(code, COUNTRY_GDP[code].sourceKey);
    return q.source?.measureClass === "nominal-gva";
  }).map((c) => COUNTRY_GDP[c].name);
  const contested = COUNTRY_ORDER.filter((code) => {
    if (!visible.has(code)) return false;
    const q = qualityForCountry(code, COUNTRY_GDP[code].sourceKey);
    return (q.country.contested?.length ?? 0) > 0;
  }).map((c) => COUNTRY_GDP[c].name);

  return (
    <div
      className="rounded-md border border-[#e0d6c6] bg-[#fbf8f2] px-3 py-2 text-xs leading-relaxed text-[#5c6b73]"
      role="note"
    >
      <p>
        <span className="font-medium text-[#1f3d4d]">Comparability check: </span>
        Country slices are the latest industry totals from each feed — they are{" "}
        <span className="font-medium text-[#1f3d4d]">not</span> a single SNA
        concept. Nominal current-price GDP/VA: USA, China, India, and other
        World Bank sector series. Gross value added (below GDP):{" "}
        {gva.length ? gva.join(", ") : "none in this selection"}. Chain-volume
        series converted with market FX (levels not nominal USD):{" "}
        {volume.length ? volume.join(", ") : "none in this selection"}.
      </p>
      {contested.length > 0 ? (
        <p className="mt-1.5">
          <span className="font-medium text-[#c45c26]">Contested official data: </span>
          {contested.join(", ")} — open the country view and click{" "}
          <span className="font-medium text-[#1f3d4d]">Contested</span> on a
          metric for independent estimates (population, growth, implied GDP
          size). Chart totals still show the official series.
        </p>
      ) : null}
    </div>
  );
}

function StaleDataNotice() {
  if (!isSnapshotStale()) return null;
  const fetchedLabel = new Date(GDP_DATA_META.fetchedAt).toLocaleDateString(
    "en-CA",
  );
  return (
    <p
      className="rounded-md border border-[#c45c26]/35 bg-[#fff4ec] px-3 py-2 text-xs leading-relaxed text-[#8a3c18]"
      role="status"
    >
      <span className="font-semibold uppercase tracking-wide">Stale snapshot · </span>
      Industry data was last pulled on {fetchedLabel} (over 6 months ago). Run{" "}
      <code className="rounded bg-[#ffe8d8] px-1 py-0.5 text-[11px] text-[#1f3d4d]">
        npm run fetch:gdp
      </code>{" "}
      to refresh from official sources.
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
        Countries use the latest data each source publishes.{" "}
        {staleCountries.map((c) => (
          <span key={c.code}>
            <span className="font-medium text-[#1f3d4d]">{c.name}</span> is{" "}
            {c.periodLabel ?? c.year}
            {c !== staleCountries[staleCountries.length - 1] ? "; " : ". "}
          </span>
        ))}
        Newer industry detail for those economies is not in our feeds yet —
        figures are still the most recent available, not held back to a common
        year.
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
        Showing the latest available data for {country.name} (
        {country.periodLabel ?? country.year}). Other countries in this view go
        up to {maxYear} — this series has not been updated further in the source
        feed yet.
      </p>
    );
  }

  return null;
}

function LevelSummary({ node }: { node: ChartNode }) {
  const drillable = (node.children ?? []).filter(hasChildren).length;
  const n = node.children?.length ?? 0;
  const period =
    node.periodLabel ?? (node.year != null ? String(node.year) : null);
  const isWorld = node.id === "world";
  const country = countryForNode(node);

  const measureLabel = isWorld
    ? "Combined total"
    : country?.sourceKey === "statcan" || country?.sourceKey === "abs"
      ? "GDP / value added"
      : country?.sourceKey === "bea"
        ? "GDP by industry"
        : country?.sourceKey === "eurostat" || country?.sourceKey === "oecd"
          ? "Gross value added"
          : country?.sourceKey === "worldbank"
            ? "GDP (sector VA)"
            : "Gross value added";

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
          {formatMillions(node.amountMillions)}
        </span>
        <span className="text-[#8a7358]"> USD</span>
        {gdpDelta ? (
          <span
            className={`text-[11px] font-medium tabular-nums ${fiveYearDeltaClass(gdpDelta.tone)}`}
            title="Nominal GDP · 5-year change"
          >
            {gdpDelta.text}
          </span>
        ) : null}
        {inflationDrag ? (
          <span
            className={`text-[11px] font-medium tabular-nums ${fiveYearDeltaClass(inflationDrag.tone)}`}
            title={
              country?.cpiPrior5yYear != null && country?.cpiYear != null
                ? `CPI inflation drag · ${country.cpiPrior5yYear} → ${country.cpiYear}`
                : "Cumulative CPI as a negative drag"
            }
          >
            infl {inflationDrag.text}
          </span>
        ) : null}
        {realGdp ? (
          <span
            className={`text-[11px] font-semibold tabular-nums ${fiveYearDeltaClass(realGdp.tone)}`}
            title="Real GDP · nominal growth − inflation"
          >
            real {realGdp.text}
          </span>
        ) : null}
        {source ? <MeasureBadge source={source} /> : null}
        {gdpContest ? <ContestedTooltip field={gdpContest} /> : null}
      </span>
      {country?.gdpPerCapitaUsd != null ? (
        <span>
          Per capita{" "}
          <span className="font-semibold tabular-nums text-[#1f3d4d]">
            {formatUsdPerCapita(country.gdpPerCapitaUsd)}
          </span>
        </span>
      ) : null}
      {country?.bondYield10y != null ? (
        <span>
          10y yield{" "}
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
        <span className="text-xs tabular-nums">As of {period}</span>
      ) : null}
      <span>
        {isWorld
          ? `${n} countries`
          : `${n} categories${drillable > 0 ? ` · ${drillable} with subsectors` : ""}`}
      </span>
    </div>
  );
}

export default function GdpExplorer() {
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
  const sectionRoot: ChartNode | null =
    path.length > 0 ? nodeAtPath(root, path.slice(0, 1)) : null;
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
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-semibold tracking-tight text-[#1f3d4d] sm:text-4xl">
            GDP Income
          </h1>
          <p className="max-w-2xl text-sm leading-relaxed text-[#5c6b73]">
            Large economies in USD — drill from the global mix into each
            country’s industries. Use <span className="font-medium text-[#1f3d4d]">Edit list</span>{" "}
            to drop countries from the pie for side-by-side comparisons. Tap a
            labeled slice to open it.
          </p>
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
          <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-sm">
            <button
              type="button"
              className="text-[#2a6f97] hover:underline"
              onClick={goWorld}
            >
              {root.name}
            </button>
            {path.map((id, index) => {
              const node = nodeAtPath(root, path.slice(0, index + 1));
              const isLast = index === path.length - 1;
              return (
                <span key={id} className="flex items-center gap-1 text-[#5c6b73]">
                  <span aria-hidden>/</span>
                  {isLast ? (
                    <span className="text-[#1f3d4d]">{node.name}</span>
                  ) : (
                    <button
                      type="button"
                      className="text-[#2a6f97] hover:underline"
                      onClick={() => setPath(path.slice(0, index + 1))}
                    >
                      {node.name}
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
            {sectionRoot && path.length > 0 ? (
              <ContextPie
                root={root}
                section={sectionRoot}
                hoveredId={hoveredId}
                totalLabel={root.name}
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
          Sources:{" "}
          <a
            className="text-[#2a6f97] hover:underline"
            href={GDP_DATA_META.sources.bea.url}
            target="_blank"
            rel="noreferrer"
          >
            BEA/FRED
          </a>
          ,{" "}
          <a
            className="text-[#2a6f97] hover:underline"
            href={GDP_DATA_META.sources.statcan.url}
            target="_blank"
            rel="noreferrer"
          >
            StatCan
          </a>
          ,{" "}
          <a
            className="text-[#2a6f97] hover:underline"
            href={GDP_DATA_META.sources.abs.url}
            target="_blank"
            rel="noreferrer"
          >
            ABS
          </a>
          ,{" "}
          <a
            className="text-[#2a6f97] hover:underline"
            href={GDP_DATA_META.sources.eurostat.url}
            target="_blank"
            rel="noreferrer"
          >
            Eurostat
          </a>
          ,{" "}
          <a
            className="text-[#2a6f97] hover:underline"
            href={GDP_DATA_META.sources.worldbank.url}
            target="_blank"
            rel="noreferrer"
          >
            World Bank
          </a>
          ,{" "}
          <a
            className="text-[#2a6f97] hover:underline"
            href={GDP_DATA_META.sources.oecd.url}
            target="_blank"
            rel="noreferrer"
          >
            OECD
          </a>
          . Data as of{" "}
          {new Date(GDP_DATA_META.fetchedAt).toLocaleDateString("en-CA")}.
        </p>
      </footer>
    </div>
  );
}
