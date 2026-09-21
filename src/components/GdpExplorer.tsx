"use client";

import { useMemo, useState } from "react";
import ContextPie from "@/components/ContextPie";
import DrilldownPie from "@/components/DrilldownPie";
import {
  COUNTRY_GDP,
  COUNTRY_ORDER,
  GDP_DATA_META,
  WORLD_GDP,
  type CountryGdpTree,
} from "@/data/countries";
import {
  buildPieChart,
  formatMillions,
  formatPercent,
  formatPopulation,
  formatUsdPerCapita,
  hasChildren,
  nodeAtPath,
  type ChartNode,
  type PieSlice,
  type SourceLink,
} from "@/lib/pie";

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

function DemographicsBanner({ country }: { country: CountryGdpTree }) {
  if (country.gdpPerCapitaUsd == null || country.population == null) return null;
  const under18 = country.pctUnder18Proxy;
  const over65 = country.pct65Plus;
  const underLabel = country.under18ProxyLabel ?? "Ages 0–14";
  const yieldPct = country.bondYield10y;
  const yieldPeriod = country.bondYield10yPeriod;

  return (
    <div
      className="grid gap-3 rounded-md border border-[#e0d6c6] bg-[#fbf8f2] px-4 py-3 sm:grid-cols-2 lg:grid-cols-5"
      role="group"
      aria-label={`${country.name} population, GDP per capita, and bond yield`}
    >
      <div>
        <p className="text-[10px] uppercase tracking-[0.12em] text-[#8a7358]">
          GDP per capita
        </p>
        <p className="mt-0.5 text-2xl font-semibold tabular-nums tracking-tight text-[#1f3d4d]">
          {formatUsdPerCapita(country.gdpPerCapitaUsd)}
        </p>
        <p className="mt-0.5 text-[11px] text-[#5c6b73]">
          USD · industry GDP ÷ population ({country.populationYear})
        </p>
      </div>
      <div>
        <p className="text-[10px] uppercase tracking-[0.12em] text-[#8a7358]">
          10-year yield
        </p>
        <p className="mt-0.5 text-2xl font-semibold tabular-nums tracking-tight text-[#1f3d4d]">
          {yieldPct != null ? `${yieldPct.toFixed(2)}%` : "—"}
        </p>
        <p className="mt-0.5 text-[11px] text-[#5c6b73]">
          Govt bond · OECD IRLT
          {yieldPeriod ? ` · ${yieldPeriod}` : ""}
        </p>
      </div>
      <div>
        <p className="text-[10px] uppercase tracking-[0.12em] text-[#8a7358]">
          Population
        </p>
        <p className="mt-0.5 text-lg font-semibold tabular-nums text-[#1f3d4d]">
          {formatPopulation(country.population)}
        </p>
        <p className="mt-0.5 text-[11px] tabular-nums text-[#5c6b73]">
          {country.population.toLocaleString("en-US")} · {country.populationYear}
        </p>
      </div>
      <div>
        <p className="text-[10px] uppercase tracking-[0.12em] text-[#8a7358]">
          Under 18
        </p>
        <p className="mt-0.5 text-lg font-semibold tabular-nums text-[#1f3d4d]">
          {under18 != null ? `${under18}%` : "—"}
        </p>
        <p className="mt-0.5 text-[11px] text-[#5c6b73]">
          {underLabel} share of population
          {country.pctUnder15Year != null ? ` · ${country.pctUnder15Year}` : ""}
        </p>
      </div>
      <div>
        <p className="text-[10px] uppercase tracking-[0.12em] text-[#8a7358]">
          Ages 65+
        </p>
        <p className="mt-0.5 text-lg font-semibold tabular-nums text-[#1f3d4d]">
          {over65 != null ? `${over65}%` : "—"}
        </p>
        <p className="mt-0.5 text-[11px] text-[#5c6b73]">
          Share of population
          {country.pct65PlusYear != null ? ` · ${country.pct65PlusYear}` : ""}
        </p>
      </div>
    </div>
  );
}

function SliceRow({
  slice,
  active,
  drillable,
  onHover,
  onOpen,
}: {
  slice: PieSlice;
  active: boolean;
  drillable: boolean;
  onHover: (id: string | null) => void;
  onOpen: () => void;
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
  const tip = [
    slice.name,
    metrics,
    perCapita ? `GDP per capita: ${perCapita}` : null,
    bondYield ? `10y bond yield: ${bondYield}` : null,
    period ? `Period: ${period}` : null,
    sourceSummary(slice.sources),
  ]
    .filter(Boolean)
    .join("\n");

  const label = (
    <>
      {swatch}
      <span className={`min-w-0 flex-1 truncate text-sm ${nameClass}`}>
        {slice.name}
        {period ? (
          <span className="ml-1.5 text-[10px] tabular-nums text-[#8a7358]">
            {period}
          </span>
        ) : null}
      </span>
      <span className={`shrink-0 text-right text-xs tabular-nums ${amountClass}`}>
        <span className="block">{metrics}</span>
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
    </li>
  );
}

function ScopeTabs({
  path,
  onWorld,
  onCountry,
}: {
  path: string[];
  onWorld: () => void;
  onCountry: (code: string) => void;
}) {
  const activeCountry =
    path.length > 0
      ? COUNTRY_ORDER.find((code) => COUNTRY_GDP[code].id === path[0])
      : null;

  return (
    <div role="tablist" aria-label="Scope" className="flex flex-wrap gap-2">
      <button
        type="button"
        role="tab"
        aria-selected={path.length === 0}
        onClick={onWorld}
        className={`rounded-md px-3.5 py-2 text-sm transition ${
          path.length === 0
            ? "bg-[#1f3d4d] text-[#f7f3ec]"
            : "bg-[#ebe4d8] text-[#1f3d4d] hover:bg-[#e0d6c6]"
        }`}
      >
        All countries
      </button>
      {COUNTRY_ORDER.map((code) => {
        const country = COUNTRY_GDP[code];
        const active = activeCountry === code;
        return (
          <button
            key={code}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onCountry(code)}
            className={`rounded-md px-3.5 py-2 text-sm transition ${
              active
                ? "bg-[#1f3d4d] text-[#f7f3ec]"
                : "bg-[#ebe4d8] text-[#1f3d4d] hover:bg-[#e0d6c6]"
            }`}
          >
            <span className="font-medium">{country.name}</span>
            <span
              className={`ml-2 tabular-nums text-xs ${
                active ? "text-[#c8d5dc]" : "text-[#5c6b73]"
              }`}
            >
              {country.periodLabel ?? country.year}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function YearLagNotice({ node }: { node: ChartNode }) {
  const maxYear = GDP_DATA_META.maxYear;
  const staleCountries = COUNTRY_ORDER.map((code) => COUNTRY_GDP[code]).filter(
    (c) => c.year < maxYear,
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

  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm text-[#5c6b73]">
      <span>
        {measureLabel}{" "}
        <span className="font-semibold tabular-nums text-[#1f3d4d]">
          {formatMillions(node.amountMillions)}
        </span>
        <span className="text-[#8a7358]"> USD</span>
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
  const root = WORLD_GDP;
  const [path, setPath] = useState<string[]>([]);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const current = useMemo(() => nodeAtPath(root, path), [root, path]);
  const chart = useMemo(() => buildPieChart(current), [current]);
  const sectionRoot: ChartNode | null =
    path.length > 0 ? nodeAtPath(root, path.slice(0, 1)) : null;
  const activeCountry = countryForNode(current);

  function goWorld() {
    setPath([]);
    setHoveredId(null);
  }

  function goCountry(code: string) {
    const country = COUNTRY_GDP[code] as CountryGdpTree;
    setPath([country.id]);
    setHoveredId(null);
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <header className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-semibold tracking-tight text-[#1f3d4d] sm:text-4xl">
            GDP Income
          </h1>
          <p className="max-w-2xl text-sm leading-relaxed text-[#5c6b73]">
            Ten large economies in USD — drill from the global mix into each
            country’s industries. Official national sources where available;
            OECD and World Bank fill gaps. Hover a slice for the data source.
          </p>
        </div>
        <ScopeTabs path={path} onWorld={goWorld} onCountry={goCountry} />
        <LevelSummary node={current} />
        {activeCountry ? <DemographicsBanner country={activeCountry} /> : null}
        <YearLagNotice node={current.id === "world" ? root : current} />
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

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,20rem)] lg:items-start">
        <DrilldownPie
          node={current}
          hoveredId={hoveredId}
          onHover={setHoveredId}
          onSelect={(id) => {
            setPath((prev) => [...prev, id]);
            setHoveredId(null);
          }}
        />

        <div className="flex flex-col gap-4">
          {sectionRoot && path.length > 0 ? (
            <ContextPie
              root={root}
              section={sectionRoot}
              hoveredId={hoveredId}
              totalLabel={root.name}
            />
          ) : null}
          <ul className="flex flex-col gap-0.5">
            {chart.legend.map((slice) => (
              <SliceRow
                key={slice.id}
                slice={slice}
                active={hoveredId === slice.id}
                drillable={hasChildren(slice)}
                onHover={setHoveredId}
                onOpen={() => {
                  setPath((prev) => [...prev, slice.id]);
                  setHoveredId(null);
                }}
              />
            ))}
          </ul>
        </div>
      </div>

      <footer className="border-t border-[#e0d6c6] pt-4 text-xs leading-relaxed text-[#5c6b73]">
        <p>
          <strong className="font-medium text-[#1f3d4d]">USA:</strong>{" "}
          <a
            className="text-[#2a6f97] hover:underline"
            href={GDP_DATA_META.sources.bea.url}
            target="_blank"
            rel="noreferrer"
          >
            BEA via FRED
          </a>
          . <strong className="font-medium text-[#1f3d4d]">Canada:</strong>{" "}
          <a
            className="text-[#2a6f97] hover:underline"
            href={GDP_DATA_META.sources.statcan.url}
            target="_blank"
            rel="noreferrer"
          >
            Statistics Canada 36-10-0434
          </a>
          . <strong className="font-medium text-[#1f3d4d]">Australia:</strong>{" "}
          <a
            className="text-[#2a6f97] hover:underline"
            href={GDP_DATA_META.sources.abs.url}
            target="_blank"
            rel="noreferrer"
          >
            ABS GDP(P)
          </a>
          .{" "}
          <strong className="font-medium text-[#1f3d4d]">
            DE / FR / IT:
          </strong>{" "}
          <a
            className="text-[#2a6f97] hover:underline"
            href={GDP_DATA_META.sources.eurostat.url}
            target="_blank"
            rel="noreferrer"
          >
            Eurostat
          </a>
          .{" "}
          <strong className="font-medium text-[#1f3d4d]">China / India:</strong>{" "}
          <a
            className="text-[#2a6f97] hover:underline"
            href={GDP_DATA_META.sources.worldbank.url}
            target="_blank"
            rel="noreferrer"
          >
            World Bank WDI
          </a>
          . <strong className="font-medium text-[#1f3d4d]">Japan / UK:</strong>{" "}
          <a
            className="text-[#2a6f97] hover:underline"
            href={GDP_DATA_META.sources.oecd.url}
            target="_blank"
            rel="noreferrer"
          >
            OECD Table 6
          </a>
          . Population &amp; age structure from{" "}
          <a
            className="text-[#2a6f97] hover:underline"
            href={GDP_DATA_META.sources.population.url}
            target="_blank"
            rel="noreferrer"
          >
            World Bank WDI
          </a>{" "}
          (under-18 shown as ages 0–14). 10-year yields from{" "}
          <a
            className="text-[#2a6f97] hover:underline"
            href={GDP_DATA_META.sources.bondYields.url}
            target="_blank"
            rel="noreferrer"
          >
            OECD IRLT
          </a>
          . OECD is also the fallback when a national feed fails
          {GDP_DATA_META.oecdFallbackUsed.length
            ? ` (active for ${GDP_DATA_META.oecdFallbackUsed.join(", ")})`
            : ""}.
          USD via World Bank PA.NUS.FCRF. Fetched{" "}
          {new Date(GDP_DATA_META.fetchedAt).toLocaleDateString("en-CA")}.
        </p>
        <p className="mt-1">
          Refresh with{" "}
          <code className="text-[#1f3d4d]">npm run fetch:gdp</code>.
        </p>
      </footer>
    </div>
  );
}
