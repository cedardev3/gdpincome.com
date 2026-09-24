/**
 * Hierarchical pie-chart helpers (drill-down slices, offsets, formatting).
 * Generic amounts — use for GDP composition or any positive/offset tree.
 */

export type SourceLink = {
  label: string;
  url: string;
};

export type ChartNode = {
  id: string;
  name: string;
  code?: string;
  amountMillions: number;
  color: string;
  description: string;
  sources: SourceLink[];
  year?: number;
  periodLabel?: string;
  children?: ChartNode[];
  /** Optional demographics (present on country roots). */
  population?: number;
  populationPrior5y?: number | null;
  gdpPerCapitaWbUsd?: number | null;
  gdpPerCapitaWbPrior5yUsd?: number | null;
  inflationCumulative5yPct?: number | null;
};

export type PieSlice = ChartNode & {
  startAngle: number;
  endAngle: number;
  /** Share used for labels: of parent net when parent > 0, else of gross |children|. */
  percent: number;
  isOffset: boolean;
};

export type PieChartModel = {
  /** Solid wedges — positive amounts only (or hatch-only when the parent has no positives). */
  slices: PieSlice[];
  /** Negative amounts drawn on top of the positive pie (do not expand geometry). */
  overlays: PieSlice[];
  /** Sidebar / legend ordered largest → smallest by amount. */
  legend: PieSlice[];
};

export function hasChildren(node: ChartNode): boolean {
  return Boolean(node.children && node.children.length > 0);
}

export function positiveChildren(node: ChartNode): ChartNode[] {
  return (node.children ?? []).filter((child) => child.amountMillions > 0);
}

export function offsetChildren(node: ChartNode): ChartNode[] {
  return (node.children ?? []).filter((child) => child.amountMillions < 0);
}

/** Children that contribute a wedge or overlay (non-zero). Preserves source order. */
export function chartChildren(node: ChartNode): ChartNode[] {
  return (node.children ?? []).filter((child) => child.amountMillions !== 0);
}

export function totalPositive(node: ChartNode): number {
  return positiveChildren(node).reduce((sum, child) => sum + child.amountMillions, 0);
}

export function shareOf(amountMillions: number, totalMillions: number): number {
  if (totalMillions <= 0) {
    throw new Error("Cannot compute a share against a non-positive total");
  }
  return amountMillions / totalMillions;
}

/** Share of a parent net total. Null when the parent is zero or a net offset. */
export function shareOfParent(
  amountMillions: number,
  parentAmountMillions: number,
): number | null {
  if (parentAmountMillions <= 0) return null;
  return amountMillions / parentAmountMillions;
}

export function grossAbsTotal(nodes: ChartNode[]): number {
  return nodes.reduce((sum, node) => sum + Math.abs(node.amountMillions), 0);
}

/**
 * Label percent for a child under `parent`.
 * Prefer share of parent net; if parent is a net offset, use signed share of gross |children|.
 */
export function displayPercent(child: ChartNode, parent: ChartNode): number {
  const ofNet = shareOfParent(child.amountMillions, parent.amountMillions);
  if (ofNet != null) return ofNet;
  const gross = grossAbsTotal(chartChildren(parent));
  if (gross <= 0) {
    throw new Error(`Cannot compute display percent under "${parent.id}"`);
  }
  return child.amountMillions / gross;
}

export function nodeAtPath(root: ChartNode, path: string[]): ChartNode {
  let node = root;
  for (const id of path) {
    if (!node.children) {
      throw new Error(`Path id "${id}" requested but "${node.id}" has no children`);
    }
    const next = node.children.find((child) => child.id === id);
    if (!next) {
      throw new Error(`No child "${id}" under "${node.id}"`);
    }
    node = next;
  }
  return node;
}

/**
 * Build the pie model for a parent node.
 *
 * - Positive amounts become solid wedges that fill the circle (relative to each other).
 * - Negative amounts become hatched overlays on top of those wedges — they slash the
 *   totals visually without expanding the pie.
 * - Parents with only offsets render hatch-only wedges (no solid base).
 */
export function buildPieChart(parent: ChartNode): PieChartModel {
  const positives = positiveChildren(parent);
  const offsets = offsetChildren(parent);
  const positiveTotal = positives.reduce((sum, n) => sum + n.amountMillions, 0);

  let slices: PieSlice[] = [];
  let overlays: PieSlice[] = [];

  if (positives.length > 0 && positiveTotal > 0) {
    let cursor = -Math.PI / 2;
    slices = positives.map((node) => {
      const sweep = (node.amountMillions / positiveTotal) * Math.PI * 2;
      const slice: PieSlice = {
        ...node,
        startAngle: cursor,
        endAngle: cursor + sweep,
        percent: displayPercent(node, parent),
        isOffset: false,
      };
      cursor += sweep;
      return slice;
    });

    let overlayCursor = -Math.PI / 2;
    let remaining = Math.PI * 2;
    for (const node of offsets) {
      if (remaining <= 1e-9) break;
      const raw = (Math.abs(node.amountMillions) / positiveTotal) * Math.PI * 2;
      const sweep = Math.min(raw, remaining);
      overlays.push({
        ...node,
        startAngle: overlayCursor,
        endAngle: overlayCursor + sweep,
        percent: displayPercent(node, parent),
        isOffset: true,
      });
      overlayCursor += sweep;
      remaining -= sweep;
    }
  } else if (offsets.length > 0) {
    const absTotal = grossAbsTotal(offsets);
    let cursor = -Math.PI / 2;
    slices = offsets.map((node) => {
      const sweep = (Math.abs(node.amountMillions) / absTotal) * Math.PI * 2;
      const slice: PieSlice = {
        ...node,
        startAngle: cursor,
        endAngle: cursor + sweep,
        percent: displayPercent(node, parent),
        isOffset: true,
      };
      cursor += sweep;
      return slice;
    });
  }

  const byId = new Map<string, PieSlice>();
  for (const slice of [...slices, ...overlays]) {
    byId.set(slice.id, slice);
  }
  const legend = chartChildren(parent)
    .map((child) => byId.get(child.id))
    .filter((slice): slice is PieSlice => slice != null)
    .sort((a, b) => b.amountMillions - a.amountMillions);

  return { slices, overlays, legend };
}

export function childWedgeInParentSlice(
  parentSlice: PieSlice,
  parent: ChartNode,
  childId: string,
): { startAngle: number; endAngle: number } | null {
  const chart = buildPieChart(parent);
  const child =
    chart.slices.find((s) => s.id === childId) ??
    chart.overlays.find((s) => s.id === childId);
  if (!child) return null;

  const parentSweep = parentSlice.endAngle - parentSlice.startAngle;
  const full = Math.PI * 2;
  const childStart = child.startAngle + Math.PI / 2;
  const childEnd = child.endAngle + Math.PI / 2;
  const startFrac = ((((childStart % full) + full) % full) / full);
  const endFrac = ((((childEnd % full) + full) % full) / full);
  const startAngle = parentSlice.startAngle + startFrac * parentSweep;
  let endAngle = parentSlice.startAngle + endFrac * parentSweep;
  if (endAngle <= startAngle) {
    endAngle = startAngle + ((child.endAngle - child.startAngle) / full) * parentSweep;
  }
  return { startAngle, endAngle };
}

export function formatMillions(amountMillions: number): string {
  const sign = amountMillions < 0 ? "-" : "";
  const abs = Math.abs(amountMillions);
  if (abs >= 1_000_000) {
    return `${sign}$${trimZeros((abs / 1_000_000).toFixed(3))} trillion`;
  }
  if (abs >= 1_000) {
    const decimals = abs >= 100_000 ? 1 : 2;
    return `${sign}$${trimZeros((abs / 1_000).toFixed(decimals))} billion`;
  }
  return `${sign}$${abs.toLocaleString("en-US")} million`;
}

export function formatPercent(percent: number): string {
  return `${(percent * 100).toFixed(1)}%`;
}

export function formatUsdPerCapita(usd: number): string {
  return `$${Math.round(usd).toLocaleString("en-US")}`;
}

export function formatPopulation(n: number): string {
  if (n >= 1_000_000_000) {
    return `${trimZeros((n / 1_000_000_000).toFixed(2))} billion`;
  }
  if (n >= 1_000_000) {
    return `${trimZeros((n / 1_000_000).toFixed(1))} million`;
  }
  return n.toLocaleString("en-US");
}

export type FiveYearDelta = {
  text: string;
  tone: "up" | "down" | "flat";
  /** Raw percentage points (positive = increase). */
  pct: number;
};

function formatFiveYearPct(pct: number): FiveYearDelta {
  const tone: FiveYearDelta["tone"] =
    pct > 0.005 ? "up" : pct < -0.005 ? "down" : "flat";
  const sign = pct > 0.005 ? "+" : pct < -0.005 ? "−" : "";
  const abs = Math.abs(pct);
  const decimals = abs >= 10 ? 1 : 2;
  return {
    text: `${sign}${abs.toFixed(decimals)}% (5yr)`,
    tone,
    pct,
  };
}

/** Relative % change formatted like `+3.27% (5yr)`. */
export function fiveYearDelta(
  current: number | null | undefined,
  prior: number | null | undefined,
): FiveYearDelta | null {
  if (current == null || prior == null) return null;
  if (!Number.isFinite(current) || !Number.isFinite(prior)) return null;
  if (Math.abs(prior) < 1e-9) return null;
  const pct = ((current - prior) / Math.abs(prior)) * 100;
  return formatFiveYearPct(pct);
}

type WithGdpFiveYearFields = {
  gdpPerCapitaWbUsd?: number | null;
  gdpPerCapitaWbPrior5yUsd?: number | null;
  population?: number | null;
  populationPrior5y?: number | null;
  inflationCumulative5yPct?: number | null;
};

/** Nominal total GDP 5y change from World Bank GDP/capita × population. */
export function gdpTotalFiveYearDelta(
  node: WithGdpFiveYearFields,
): FiveYearDelta | null {
  const now =
    node.gdpPerCapitaWbUsd != null && node.population != null
      ? node.gdpPerCapitaWbUsd * node.population
      : null;
  const prior =
    node.gdpPerCapitaWbPrior5yUsd != null && node.populationPrior5y != null
      ? node.gdpPerCapitaWbPrior5yUsd * node.populationPrior5y
      : null;
  return fiveYearDelta(now, prior);
}

/**
 * Cumulative CPI shown as a drag on growth (always the negative of price rise
 * when inflation is positive). Example: 18% CPI rise → `−18.0% (5yr)`.
 */
export function inflationFiveYearDrag(
  node: WithGdpFiveYearFields,
): FiveYearDelta | null {
  const cum = node.inflationCumulative5yPct;
  if (cum == null || !Number.isFinite(cum)) return null;
  return formatFiveYearPct(-cum);
}

/**
 * Inflation-adjusted GDP change: nominal growth − cumulative inflation.
 * Inflation is treated as a negative contribution to the net.
 */
export function realGdpFiveYearDelta(
  node: WithGdpFiveYearFields,
): FiveYearDelta | null {
  const nominal = gdpTotalFiveYearDelta(node);
  const inflation = node.inflationCumulative5yPct;
  if (nominal == null || inflation == null || !Number.isFinite(inflation)) {
    return null;
  }
  return formatFiveYearPct(nominal.pct - inflation);
}

export function fiveYearDeltaClass(tone: FiveYearDelta["tone"]): string {
  if (tone === "up") return "text-[#2f7d3c]";
  if (tone === "down") return "text-[#c45c26]";
  return "text-[#8a7358]";
}

/** Tooltip-friendly class on dark pie hover chip. */
export function fiveYearDeltaClassOnDark(tone: FiveYearDelta["tone"]): string {
  if (tone === "up") return "text-[#8fd99a]";
  if (tone === "down") return "text-[#f0a070]";
  return "text-[#e8dcc8]";
}

function trimZeros(value: string): string {
  return value.replace(/\.?0+$/, "");
}

/** Stable SVG numbers so SSR and client don't diverge on float noise. */
export function svgNum(n: number): string {
  return (Math.round(n * 1e4) / 1e4).toString();
}

export function polar(cx: number, cy: number, radius: number, angle: number) {
  return {
    x: cx + radius * Math.cos(angle),
    y: cy + radius * Math.sin(angle),
  };
}

export function midAngle(startAngle: number, endAngle: number): number {
  return (startAngle + endAngle) / 2;
}

/** Approximate characters that fit along an arc at the given radius. */
export function charsFitOnArc(
  radius: number,
  sweepRadians: number,
  pxPerChar = 6.8,
): number {
  const arc = Math.abs(sweepRadians) * radius;
  return Math.max(0, Math.floor(arc / pxPerChar));
}

export function truncateLabel(name: string, maxChars: number): string {
  const trimmed = name.trim();
  if (maxChars < 2) return "";
  if (trimmed.length <= maxChars) return trimmed;
  if (maxChars < 4) return trimmed.slice(0, maxChars);
  return `${trimmed.slice(0, maxChars - 1)}…`;
}

export function pieSlicePath(
  cx: number,
  cy: number,
  radius: number,
  startAngle: number,
  endAngle: number,
): string {
  const sweep = endAngle - startAngle;
  if (sweep >= Math.PI * 2 - 1e-6) {
    return [
      `M ${svgNum(cx)} ${svgNum(cy - radius)}`,
      `A ${svgNum(radius)} ${svgNum(radius)} 0 1 1 ${svgNum(cx)} ${svgNum(cy + radius)}`,
      `A ${svgNum(radius)} ${svgNum(radius)} 0 1 1 ${svgNum(cx)} ${svgNum(cy - radius)}`,
      "Z",
    ].join(" ");
  }

  const start = polar(cx, cy, radius, startAngle);
  const end = polar(cx, cy, radius, endAngle);
  const largeArc = sweep > Math.PI ? 1 : 0;
  return [
    `M ${svgNum(cx)} ${svgNum(cy)}`,
    `L ${svgNum(start.x)} ${svgNum(start.y)}`,
    `A ${svgNum(radius)} ${svgNum(radius)} 0 ${largeArc} 1 ${svgNum(end.x)} ${svgNum(end.y)}`,
    "Z",
  ].join(" ");
}
