"use client";

import type { ReactNode } from "react";
import type { ContestedField, SourceQuality } from "@/data/data-quality";

/** Accessible contested-data callout with alternate estimates. */
export function ContestedTooltip({
  field,
  children,
}: {
  field: ContestedField;
  children?: ReactNode;
}) {
  return (
    <details className="group relative inline-block max-w-full">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 marker:content-none [&::-webkit-details-marker]:hidden">
        {children}
        <span
          className="inline-flex h-4 items-center rounded border border-[#c45c26]/40 bg-[#fff4ec] px-1 text-[10px] font-medium uppercase tracking-wide text-[#8a3c18]"
          title={field.title}
        >
          Contested
        </span>
      </summary>
      <div className="absolute left-0 z-30 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-md border border-[#e0d6c6] bg-[#fbf8f2] p-3 text-left shadow-md">
        <p className="text-xs font-medium text-[#1f3d4d]">{field.title}</p>
        <p className="mt-1 text-[11px] leading-relaxed text-[#5c6b73]">
          {field.why}
        </p>
        <p className="mt-2 text-[10px] uppercase tracking-[0.1em] text-[#8a7358]">
          {field.officialLabel}
        </p>
        <ul className="mt-2 flex flex-col gap-2">
          {field.alternatives.map((alt) => (
            <li key={`${alt.label}-${alt.value}`} className="text-[11px] leading-snug text-[#5c6b73]">
              <span className="font-medium text-[#1f3d4d]">{alt.label}: </span>
              <span className="tabular-nums text-[#1f3d4d]">{alt.value}</span>
              <span className="text-[#8a7358]"> · {alt.yearLabel}</span>
              <span className="block mt-0.5">{alt.note}</span>
              <a
                className="mt-0.5 inline-block text-[#2a6f97] hover:underline"
                href={alt.url}
                target="_blank"
                rel="noreferrer"
              >
                Source
              </a>
            </li>
          ))}
        </ul>
        {field.counterpoints?.length ? (
          <div className="mt-2 border-t border-[#e0d6c6] pt-2">
            <p className="text-[10px] uppercase tracking-[0.1em] text-[#8a7358]">
              Counterpoint
            </p>
            {field.counterpoints.map((c) => (
              <p key={c.label} className="mt-1 text-[11px] leading-snug text-[#5c6b73]">
                <span className="font-medium text-[#1f3d4d]">{c.label}: </span>
                {c.note}{" "}
                <a
                  className="text-[#2a6f97] hover:underline"
                  href={c.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Source
                </a>
              </p>
            ))}
          </div>
        ) : null}
      </div>
    </details>
  );
}

export function MeasureBadge({
  source,
  compact,
}: {
  source: SourceQuality;
  compact?: boolean;
}) {
  const warn = !source.levelComparableToNominalUsd;
  return (
    <span
      className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium tracking-wide ${
        warn
          ? "border-[#8a7358]/50 bg-[#fff8ee] text-[#8a7358]"
          : "border-[#2f7d6d]/40 bg-[#eef6f3] text-[#2f7d6d]"
      }`}
      title={source.summary}
    >
      {compact ? source.badge : source.badge}
    </span>
  );
}
