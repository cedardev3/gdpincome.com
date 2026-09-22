import type { FlagComponent } from "country-flag-icons/react/3x2";
import {
  AE,
  AR,
  AT,
  AU,
  BD,
  BE,
  BR,
  CA,
  CH,
  CN,
  DE,
  EG,
  ES,
  FR,
  GB,
  ID,
  IE,
  IL,
  IN,
  IT,
  JP,
  KR,
  MX,
  NG,
  NL,
  NO,
  PL,
  RU,
  SA,
  SE,
  SG,
  TH,
  TR,
  US,
  VN,
  ZA,
} from "country-flag-icons/react/3x2";

/** ISO 3166-1 alpha-3 → alpha-2 for chart countries. */
export const ISO3_TO_ISO2: Record<string, string> = {
  USA: "US",
  CHN: "CN",
  DEU: "DE",
  JPN: "JP",
  IND: "IN",
  GBR: "GB",
  FRA: "FR",
  ITA: "IT",
  CAN: "CA",
  AUS: "AU",
  RUS: "RU",
  BRA: "BR",
  ESP: "ES",
  KOR: "KR",
  MEX: "MX",
  TUR: "TR",
  IDN: "ID",
  NLD: "NL",
  SAU: "SA",
  CHE: "CH",
  POL: "PL",
  BEL: "BE",
  IRL: "IE",
  ARG: "AR",
  SWE: "SE",
  NOR: "NO",
  THA: "TH",
  ARE: "AE",
  SGP: "SG",
  NGA: "NG",
  ZAF: "ZA",
  AUT: "AT",
  ISR: "IL",
  EGY: "EG",
  VNM: "VN",
  BGD: "BD",
};

const FLAGS: Record<string, FlagComponent> = {
  US,
  CN,
  DE,
  JP,
  IN,
  GB,
  FR,
  IT,
  CA,
  AU,
  RU,
  BR,
  ES,
  KR,
  MX,
  TR,
  ID,
  NL,
  SA,
  CH,
  PL,
  BE,
  IE,
  AR,
  SE,
  NO,
  TH,
  AE,
  SG,
  NG,
  ZA,
  AT,
  IL,
  EG,
  VN,
  BD,
};

export function iso2For(iso3: string): string | null {
  return ISO3_TO_ISO2[iso3] ?? null;
}

export function FlagIcon({
  iso3,
  className,
  title,
}: {
  iso3: string;
  className?: string;
  title?: string;
}) {
  const iso2 = iso2For(iso3);
  const Comp = iso2 ? FLAGS[iso2] : null;
  if (!Comp) return null;
  return (
    <span className="inline-flex leading-none" title={title}>
      <Comp className={className} aria-hidden />
    </span>
  );
}
