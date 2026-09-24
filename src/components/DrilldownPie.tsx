"use client";

import { useId } from "react";
import { FlagIcon } from "@/lib/flags";
import {
  buildPieChart,
  charsFitOnArc,
  formatMillions,
  formatPercent,
  fiveYearDeltaClassOnDark,
  gdpTotalFiveYearDelta,
  inflationFiveYearDrag,
  realGdpFiveYearDelta,
  hasChildren,
  midAngle,
  pieSlicePath,
  polar,
  svgNum,
  truncateLabel,
  type ChartNode,
  type PieSlice,
} from "@/lib/pie";

type DrilldownPieProps = {
  node: ChartNode;
  /** World view: label with country code / flag. Deeper: truncated sector names. */
  labelMode: "country" | "sector";
  hoveredId: string | null;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
  /** Show a back control when drilled in. */
  canGoBack?: boolean;
  onBack?: () => void;
};

const SIZE = 520;
const CX = SIZE / 2;
const CY = SIZE / 2;
const RADIUS = 214;
const LABEL_RADIUS = 148;
/** Minimum sweep (radians) to place any on-slice label. */
const MIN_SWEEP_LABEL = 0.2;
const MIN_SWEEP_FLAG = 0.32;
const MIN_CHARS_SECTOR = 4;

export default function DrilldownPie({
  node,
  labelMode,
  hoveredId,
  onHover,
  onSelect,
  canGoBack = false,
  onBack,
}: DrilldownPieProps) {
  const glowId = useId();
  const hatchId = useId();
  const chart = buildPieChart(node);
  const hovered =
    chart.legend.find((slice) => slice.id === hoveredId) ?? null;
  const hasOverlays = chart.overlays.length > 0;
  const hatchOnly = chart.slices.every((s) => s.isOffset);

  if (chart.legend.length === 0) {
    return (
      <div className="mx-auto flex min-h-[16rem] w-full max-w-[520px] items-center justify-center text-sm text-[#5c6b73]">
        No amounts to chart
      </div>
    );
  }

  return (
    <div className="relative mx-auto w-full max-w-[520px]">
      {canGoBack && onBack ? (
        <button
          type="button"
          onClick={onBack}
          className="absolute left-0 top-0 z-10 inline-flex items-center gap-1.5 rounded-md border border-[#d4c8b4] bg-[#f7f3ec]/95 px-3 py-1.5 text-sm font-semibold text-[#1f3d4d] shadow-sm backdrop-blur-sm transition hover:border-[#1f3d4d] hover:bg-[#ebe4d8] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2a6f97]"
          aria-label="Go back"
        >
          <span aria-hidden className="text-base leading-none">
            ←
          </span>
          Back
        </button>
      ) : null}
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        role="img"
        aria-label={node.name}
        className="h-auto w-full"
      >
        <defs>
          <filter id={glowId} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <pattern
            id={hatchId}
            width="8"
            height="8"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <rect width="8" height="8" fill="#f3ebe0" fillOpacity="0.55" />
            <line
              x1="0"
              y1="0"
              x2="0"
              y2="8"
              stroke="#8a7358"
              strokeWidth="2.5"
              strokeOpacity="0.9"
            />
          </pattern>
        </defs>

        {chart.slices.map((slice) => (
          <PieWedge
            key={slice.id}
            slice={slice}
            mode={slice.isOffset ? "hatch-base" : "solid"}
            hatchId={hatchId}
            glowId={glowId}
            hovered={hoveredId === slice.id}
            onHover={onHover}
            onSelect={onSelect}
          />
        ))}

        {chart.overlays.map((slice) => (
          <PieWedge
            key={`overlay-${slice.id}`}
            slice={slice}
            mode="overlay"
            hatchId={hatchId}
            glowId={glowId}
            hovered={hoveredId === slice.id}
            onHover={onHover}
            onSelect={onSelect}
          />
        ))}

        {/* Labels above wedges so they stay readable */}
        {chart.slices.map((slice) => (
          <SliceLabel
            key={`label-${slice.id}`}
            slice={slice}
            labelMode={labelMode}
          />
        ))}

        <circle cx={CX} cy={CY} r={86} fill="#fbf8f2" />
        <text
          x={CX}
          y={CY - 8}
          textAnchor="middle"
          className="fill-[#1f3d4d]"
          style={{ fontSize: 13, fontWeight: 650 }}
        >
          {node.name.includes(",") ? node.name.split(",")[0] : node.name}
        </text>
        <text
          x={CX}
          y={CY + 14}
          textAnchor="middle"
          className="fill-[#5c6b73]"
          style={{ fontSize: 12 }}
        >
          {formatMillions(node.amountMillions)}
        </text>
      </svg>
      {hovered ? (
        <div className="pointer-events-none absolute left-1/2 top-2 z-10 max-w-[min(100%,20rem)] -translate-x-1/2 rounded-lg bg-[#1f3d4d] px-3 py-1.5 text-center text-white shadow-lg">
          <p className="text-sm font-semibold">{hovered.name}</p>
          <p className="text-xs text-[#e8dcc8]">
            {formatMillions(hovered.amountMillions)} · {formatPercent(hovered.percent)}
            {hovered.isOffset ? " · offset" : ""}
            {hovered.periodLabel || hovered.year
              ? ` · ${hovered.periodLabel ?? hovered.year}`
              : ""}
          </p>
          {(() => {
            const gdp5yr = gdpTotalFiveYearDelta(hovered);
            const inflation = inflationFiveYearDrag(hovered);
            const real = realGdpFiveYearDelta(hovered);
            if (!gdp5yr && !inflation && !real) return null;
            return (
              <div className="mt-0.5 space-y-0.5 text-xs font-medium tabular-nums">
                {gdp5yr ? (
                  <p className={fiveYearDeltaClassOnDark(gdp5yr.tone)}>
                    {gdp5yr.text}
                  </p>
                ) : null}
                {inflation ? (
                  <p className={fiveYearDeltaClassOnDark(inflation.tone)}>
                    inflation {inflation.text}
                  </p>
                ) : null}
                {real ? (
                  <p className={fiveYearDeltaClassOnDark(real.tone)}>
                    real {real.text}
                  </p>
                ) : null}
              </div>
            );
          })()}
          {hovered.sources?.length ? (
            <p className="mt-0.5 text-[10px] leading-snug text-[#c4b59a]">
              Source: {hovered.sources.map((s) => s.label).join(" · ")}
            </p>
          ) : null}
          <p className="mt-0.5 text-[10px] text-[#a89880]">
            {hasChildren(hovered) ? "Tap to open" : "No further detail"}
          </p>
        </div>
      ) : null}
      {hasOverlays && !hatchOnly ? (
        <p className="mt-2 text-center text-[11px] text-[#8a7358]">
          Hatch overlays mark offsets cutting into the totals above — they reduce the net
          without adding pie slices.
        </p>
      ) : null}
    </div>
  );
}

function SliceLabel({
  slice,
  labelMode,
}: {
  slice: PieSlice;
  labelMode: "country" | "sector";
}) {
  const sweep = slice.endAngle - slice.startAngle;
  if (sweep < MIN_SWEEP_LABEL || slice.isOffset) return null;

  const angle = midAngle(slice.startAngle, slice.endAngle);
  const { x, y } = polar(CX, CY, LABEL_RADIUS, angle);

  if (labelMode === "country") {
    const code = slice.code;
    if (!code) return null;
    const showFlag = sweep >= MIN_SWEEP_FLAG;
    if (showFlag) {
      return (
        <g pointerEvents="none" aria-hidden>
          <foreignObject
            x={svgNum(x - 18)}
            y={svgNum(y - 16)}
            width={36}
            height={32}
          >
            <div className="flex flex-col items-center gap-0.5 leading-none">
              <FlagIcon iso3={code} className="h-3 w-[1.125rem] rounded-[1px] shadow-sm" />
              <span
                className="text-[10px] font-semibold tabular-nums tracking-wide text-white"
                style={{ textShadow: "0 0 3px rgba(0,0,0,.85), 0 1px 2px rgba(0,0,0,.7)" }}
              >
                {code}
              </span>
            </div>
          </foreignObject>
        </g>
      );
    }
    return (
      <text
        x={svgNum(x)}
        y={svgNum(y)}
        textAnchor="middle"
        dominantBaseline="middle"
        pointerEvents="none"
        fill="#ffffff"
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.04em",
          paintOrder: "stroke",
          stroke: "rgba(0,0,0,0.55)",
          strokeWidth: 3,
        }}
      >
        {code}
      </text>
    );
  }

  const maxChars = charsFitOnArc(LABEL_RADIUS, sweep, 6.2);
  if (maxChars < MIN_CHARS_SECTOR) return null;
  const label = truncateLabel(slice.name, Math.min(maxChars, 18));
  if (!label) return null;

  return (
    <text
      x={svgNum(x)}
      y={svgNum(y)}
      textAnchor="middle"
      dominantBaseline="middle"
      pointerEvents="none"
      fill="#ffffff"
      style={{
        fontSize: sweep > 0.45 ? 11 : 9.5,
        fontWeight: 650,
        paintOrder: "stroke",
        stroke: "rgba(0,0,0,0.55)",
        strokeWidth: 3,
      }}
    >
      {label}
    </text>
  );
}

function PieWedge({
  slice,
  mode,
  hatchId,
  glowId,
  hovered,
  onHover,
  onSelect,
}: {
  slice: PieSlice;
  mode: "solid" | "overlay" | "hatch-base";
  hatchId: string;
  glowId: string;
  hovered: boolean;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
}) {
  const drillable = hasChildren(slice);
  const radius = hovered && drillable ? 222 : RADIUS;
  const path = pieSlicePath(CX, CY, radius, slice.startAngle, slice.endAngle);

  return (
    <g
      className={drillable ? "cursor-pointer" : "cursor-default"}
      onMouseEnter={() => onHover(slice.id)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(slice.id)}
      onBlur={() => onHover(null)}
      onClick={() => {
        if (drillable) onSelect(slice.id);
      }}
      tabIndex={drillable ? 0 : -1}
      role={drillable ? "button" : undefined}
      aria-label={`${slice.name}, ${formatPercent(slice.percent)}, ${formatMillions(slice.amountMillions)}${slice.isOffset ? ", offset" : ""}${drillable ? ", has more detail" : ", no further detail"}`}
      onKeyDown={(event) => {
        if (!drillable) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(slice.id);
        }
      }}
    >
      {mode === "solid" ? (
        <path
          d={path}
          fill={slice.color}
          fillOpacity={drillable ? 1 : 0.78}
          stroke="#f7f3ec"
          strokeWidth={hovered ? (drillable ? 5 : 3) : 2}
          filter={hovered && drillable ? `url(#${glowId})` : undefined}
        />
      ) : null}
      {mode === "hatch-base" ? (
        <>
          <path d={path} fill={`url(#${hatchId})`} stroke="#d9cbb8" strokeWidth={hovered ? 5 : 2} />
          <path
            d={path}
            fill={slice.color}
            fillOpacity={drillable ? 0.28 : 0.2}
            stroke="#8a7358"
            strokeWidth={hovered ? 5 : 2}
            strokeDasharray={hovered ? undefined : "5 4"}
            filter={hovered && drillable ? `url(#${glowId})` : undefined}
          />
        </>
      ) : null}
      {mode === "overlay" ? (
        <path
          d={path}
          fill={`url(#${hatchId})`}
          fillOpacity={0.92}
          stroke="#8a7358"
          strokeWidth={hovered ? (drillable ? 4 : 2) : 1.5}
          strokeDasharray={hovered ? undefined : "4 3"}
          filter={hovered && drillable ? `url(#${glowId})` : undefined}
        />
      ) : null}
    </g>
  );
}
