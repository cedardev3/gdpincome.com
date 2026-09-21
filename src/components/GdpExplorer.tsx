"use client";

import { useMemo, useState } from "react";
import ContextPie from "@/components/ContextPie";
import DrilldownPie from "@/components/DrilldownPie";
import {
  COUNTRY_GDP,
  COUNTRY_ORDER,
  GDP_DATA_META,
  type CountryGdpTree,
} from "@/data/countries";
import {
  buildPieChart,
  formatMillions,
  formatPercent,
  hasChildren,
  nodeAtPath,
  type ChartNode,
  type PieSlice,
} from "@/lib/pie";

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

  const metrics = `${formatMillions(slice.amountMillions)} · ${formatPercent(slice.percent)}`;

  const label = (
    <>
      {swatch}
      <span className={`min-w-0 flex-1 truncate text-sm ${nameClass}`}>
        {slice.name}
      </span>
      <span className={`shrink-0 text-right text-xs tabular-nums ${amountClass}`}>
        {metrics}
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
      onMouseEnter={() => onHover(slice.id)}
      onMouseLeave={() => onHover(null)}
    >
      {drillable ? (
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          onClick={onOpen}
          aria-label={`${slice.name}, open details`}
        >
          {label}
        </button>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-2">{label}</div>
      )}
    </li>
  );
}

function CountryTabs({
  selected,
  onSelect,
}: {
  selected: string;
  onSelect: (code: string) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Country"
      className="flex flex-wrap gap-2"
    >
      {COUNTRY_ORDER.map((code) => {
        const country = COUNTRY_GDP[code];
        const active = code === selected;
        return (
          <button
            key={code}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(code)}
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
              {country.year}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function CountrySummary({ country }: { country: CountryGdpTree }) {
  const drillable = (country.children ?? []).filter(hasChildren).length;
  const sections = country.children?.length ?? 0;
  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm text-[#5c6b73]">
      <span>
        Gross value added{" "}
        <span className="font-semibold tabular-nums text-[#1f3d4d]">
          {formatMillions(country.amountMillions)}
        </span>
        <span className="text-[#8a7358]"> USD</span>
      </span>
      <span>
        {sections} industry sections
        {drillable > 0 ? ` · ${drillable} with subsectors` : ""}
      </span>
      {country.currency !== "USD" ? (
        <span className="text-xs">
          Converted from {country.currency} at {country.fxLcuPerUsd.toFixed(3)}{" "}
          / USD
        </span>
      ) : null}
    </div>
  );
}

export default function GdpExplorer() {
  const [countryCode, setCountryCode] = useState<string>(COUNTRY_ORDER[0]);
  const [path, setPath] = useState<string[]>([]);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const root: CountryGdpTree = COUNTRY_GDP[countryCode];
  const current = useMemo(() => nodeAtPath(root, path), [root, path]);
  const chart = useMemo(() => buildPieChart(current), [current]);
  const sectionRoot: ChartNode | null =
    path.length > 0 ? nodeAtPath(root, path.slice(0, 1)) : null;

  function selectCountry(code: string) {
    setCountryCode(code);
    setPath([]);
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
            Gross value added by ISIC industry — click a sector for subsectors
            when available. One OECD national-accounts table across countries,
            shown in USD.
          </p>
        </div>
        <CountryTabs selected={countryCode} onSelect={selectCountry} />
        <CountrySummary country={root} />
        {path.length > 0 ? (
          <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-sm">
            <button
              type="button"
              className="text-[#2a6f97] hover:underline"
              onClick={() => setPath([])}
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
          Source:{" "}
          <a
            className="text-[#2a6f97] hover:underline"
            href={GDP_DATA_META.sourceUrl}
            target="_blank"
            rel="noreferrer"
          >
            OECD National Accounts Table 6
          </a>{" "}
          (gross value added / B1G, current prices) via DBnomics. USD conversion
          uses World Bank official exchange rates (PA.NUS.FCRF). Canada’s latest
          published year in this table is {COUNTRY_GDP.CAN.year}; USA and
          Australia use {COUNTRY_GDP.USA.year}. Data fetched{" "}
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
