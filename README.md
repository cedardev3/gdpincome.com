# gdpincome.com

Pie-first shell for visualizing GDP across major countries.

Carries over the **visual design** and **drill-down pie** logic from mytaxspend.com. Bar comparison panels were left out on purpose.

## Develop

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

Output goes to `out/` (static export).

## Layout

- `src/lib/pie.ts` — pie math
- `src/components/DrilldownPie.tsx` / `ContextPie.tsx` — SVG pies
- `src/components/GdpExplorer.tsx` — pie + legend
- `src/data/placeholder.ts` — replace with real GDP data

See [DESIGN.md](./DESIGN.md).
