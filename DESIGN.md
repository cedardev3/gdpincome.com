# Design notes — gdpincome.com

Pie-first shell for world GDP visualization. Bar comparison strips from mytaxspend.com were intentionally **not** carried over.

## Included

| Piece | Role |
| --- | --- |
| `src/app/globals.css` | Paper wash, teal ink, Geist |
| `src/lib/pie.ts` | Hierarchical pie model, SVG path helpers, formatters |
| `src/components/DrilldownPie.tsx` | Main interactive pie |
| `src/components/ContextPie.tsx` | Small “share of parent” pie while drilled in |
| `src/components/GdpExplorer.tsx` | Pie + legend list + breadcrumb (no bar charts) |
| `src/data/placeholder.ts` | Fake regional GDP tree so the pie renders |

## Not included

- `SpendingComparisons`, `InterestDefenseCompare`, `BudgetBalance`, `BudgetReconciliation`
- Tax/budget JSON, refresh scripts, US/CA jurisdiction tax labels

## Visual system

| Token | Value | Role |
| --- | --- | --- |
| `--background` | `#f7f3ec` | Page wash |
| `--foreground` | `#1f3d4d` | Primary ink |
| Accent | `#2a6f97` | Drillable chevrons / links |
| Muted | `#5c6b73` | Secondary text |
| Soft highlight | `#f4efe6` | Active legend row |
| Offset hatch | `#8a7358` | Negative / offset slices |

**Background:** dual radials — `#fff7ea` top-left, `#e7eef1` top-right over paper.

**Typography:** Geist via `layout.tsx`.

## Next steps

Replace `placeholder.ts` with real major-country GDP data. Extend `GdpExplorer` with a country picker when you are ready — keep the interaction centered on the pie + legend.
