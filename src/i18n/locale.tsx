"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { ContestedField } from "@/data/data-quality";
import {
  formatMillions,
  formatPopulation,
  formatUsdPerCapita,
} from "@/lib/pie";
import jaNames from "@/i18n/ja-names.json";

export type Locale = "en" | "ja";

const STORAGE_KEY = "gdpincome.locale.v1";

const JA_BY_ID: Record<string, string> = {
  "jpn-professional-scientific-and-technical-activities":
    "専門・科学技術、業務支援サービス業",
};

const messages = {
  en: {
    title: "GDP Income",
    introLead:
      "Large economies in USD. Select a country to view its sectors. Use ",
    introEdit: "Edit list",
    introTail: " to remove countries from the pie.",
    editList: "Edit list",
    done: "Done",
    selectAll: "Select all",
    reset: "Reset",
    tapFlags: "Tap flags",
    on: "on",
    all: "All",
    countries: "Countries",
    allSelected: "All selected countries",
    included: "Included — tap to remove",
    excluded: "Excluded — tap to add",
    contestedSeries: "Warning: official series",
    exclude: "Exclude",
    include: "Include",
    notComparable: "Not a perfect comparison: ",
    gdp5: "GDP (5yr)",
    inflation5: "Inflation (5yr)",
    real5: "Real GDP (5yr)",
    gdpPerCapita: "GDP per capita",
    nominalHint: "Nominal growth",
    inflationFallback: "Cumulative CPI. Subtracted when calculating real GDP",
    realHint: "Nominal growth − inflation",
    yield: "10-year yield",
    population: "Population",
    under18: "Under 18",
    ages65: "Ages 65+",
    govtBond: "Government bond",
    shareOfPop: "share of population",
    combined: "Combined total",
    gdpVa: "GDP / value added",
    gdpByIndustry: "GDP by industry",
    gva: "Gross value added",
    gdpSector: "GDP (sector VA)",
    usd: " USD",
    perCapita: "Per capita",
    yieldShort: "10y yield",
    asOf: "As of",
    countriesCount: "countries",
    categories: "categories",
    withSubsectors: "with subsectors",
    comparability: "Comparability check: ",
    comparabilityBody:
      "Country slices are the latest industry totals. They are not a perfect comparison. Nominal current-price GDP/VA: USA, China, India, and other World Bank sector series. Gross value added (below GDP): ",
    chainVolume:
      ". Chain-volume series converted with market FX (levels not nominal USD): ",
    noneSelected: "none in this selection",
    contestedLead: "Warning: ",
    contestedTail:
      " : open the country view and click Warning on a metric for independent estimates (population, growth, implied GDP size). Chart totals still show the official series.",
    selfReported: " GDP is self-reported official data",
    stale: "Stale snapshot · ",
    staleBody: "Industry data was last pulled on",
    staleTail: "(over 6 months ago). Run",
    staleEnd: "to refresh from official sources.",
    latestLead: "Countries use the latest data each source publishes.",
    isWord: "is",
    newer:
      "Newer industry detail for those economies is not in our feeds yet. Figures are still the most recent available, not held back to a common year.",
    showingLatest: "Showing the latest available data for",
    othersUpTo: "Other countries in this view go up to",
    seriesNotUpdated: "this series has not been updated further in the source feed yet.",
    sources: "Sources:",
    dataAsOf: "Data as of",
    breadcrumb: "Breadcrumb",
    back: "Back",
    goBack: "Go back",
    noAmounts: "No amounts to chart",
    offset: "offset",
    inflationWord: "inflation",
    realWord: "real",
    infl: "infl",
    source: "Source",
    tapOpen: "Tap to open",
    noDetail: "No further detail",
    hatch:
      "Hatch overlays mark offsets cutting into the totals above — they reduce the net without adding pie slices.",
    of: "of",
    contested: "Warning",
    counterpoint: "Counterpoint",
    remove: "Remove",
    fromComparison: "from comparison",
    openDetails: "open details",
    cap: "/cap",
    tenY: "10y",
    nominalTitle: "Nominal GDP · 5-year change",
    realTitle: "Real GDP · nominal growth − inflation",
    cpiDrag: "Cumulative CPI, subtracted in real GDP",
    cpiPrefix: "Cumulative CPI · ",
    derivedFrom: "Derived from",
    notPeer: "÷ population — not comparable to nominal USD peers",
    pcapIndustry: "USD · industry ÷ pop",
    pcapWb: "% change uses World Bank GDP/capita",
    pcapPlain: "Industry total ÷ population",
    srcBea: "BEA",
    srcEsri: "ESRI",
    srcStatcan: "StatCan",
    srcAbs: "ABS",
    srcEurostat: "Eurostat",
    srcWorldbank: "World Bank",
    srcOecd: "OECD",
    compareHint: "Tap a second flag to compare side by side.",
    compare: "Compare",
    exitCompare: "Exit compare",
    comparePick: "Tap a flag to choose the second country.",
    selectToCompare: "Select a country to compare",
    compareSwitch: "Switch the second country",
    comparingHint: "Tap another flag to switch the second country.",
    timesOther: "the other country",
    clearCompare: "Remove",
    nationalDebt: "National debt",
    debtPerCapita: "Debt per capita",
    debtPerPerson: "per person",
    debtHint: "General government gross debt · IMF",
    debtPerCapitaHint: "General government gross debt per person · IMF",
    adjustedGdpPerCapita: "Adjusted GDP per capita",
    adjustedHint: "Nominal GDP per capita minus public-debt interest per person",
    adjustedMissing: "IMF does not publish public-debt interest for this country",
    ofGdp: "of GDP",
    afterInterest: "/yr after interest",
    interestWord: "interest",
    afterInterestMissing: "After interest —",
    lifeExpectancy: "Life expectancy",
    yearsSuffix: " years",
    lifeHint: "At birth",
    metricSources:
      "Population, age shares, life expectancy, and the 5-year GDP change use World Bank figures. Inflation is cumulative CPI. National debt, debt per person, and adjusted GDP per capita use IMF debt and interest. The 10-year figure is the government bond yield. GDP per capita is the industry total divided by population.",
    empty: "—",
  },
  ja: {
    title: "GDPインカム",
    introLead:
      "主要な経済の米ドル建てGDPです。国を選ぶと、その部門が見られます。「",
    introEdit: "リストを編集",
    introTail: "」で円グラフから国を外せます。",
    editList: "リストを編集",
    done: "完了",
    selectAll: "すべて選択",
    reset: "リセット",
    tapFlags: "旗をタップ",
    on: "表示",
    all: "すべて",
    countries: "国",
    allSelected: "選択中のすべての国",
    included: "表示中。タップで外す",
    excluded: "非表示。タップで加える",
    contestedSeries: "警告：公式系列",
    exclude: "外す",
    include: "加える",
    notComparable: "完全な比較ではありません。",
    gdp5: "GDP（5年）",
    inflation5: "インフレ（5年）",
    real5: "実質GDP（5年）",
    gdpPerCapita: "1人当たりGDP",
    nominalHint: "名目の成長",
    inflationFallback: "累積CPI。実質GDPでは成長から差し引きます",
    realHint: "名目成長 − インフレ",
    yield: "10年債利回り",
    population: "人口",
    under18: "18歳未満",
    ages65: "65歳以上",
    govtBond: "国債",
    shareOfPop: "人口に占める割合",
    combined: "合計",
    gdpVa: "GDP・付加価値",
    gdpByIndustry: "産業別GDP",
    gva: "粗付加価値",
    gdpSector: "GDP（部門別付加価値）",
    usd: "",
    perCapita: "1人当たり",
    yieldShort: "10年債",
    asOf: "時点",
    countriesCount: "か国",
    categories: "区分",
    withSubsectors: "内訳あり",
    comparability: "比較上の注意：",
    comparabilityBody:
      "各国の区分は、その国で公表されている最新の産業合計です。完全な比較ではありません。名目・当年価格のGDP／付加価値は米国、中国、インド、および世界銀行の部門系列です。GDPより小さい粗付加価値：",
    chainVolume:
      "。市場為替で換算した連鎖数量（名目米ドルではない）：",
    noneSelected: "この選択にはありません",
    contestedLead: "警告：",
    contestedTail:
      "。国の画面を開き、指標の「警告」から独立推計（人口、成長率、示唆されるGDP規模）を見られます。グラフの合計は公式系列のままです。",
    selfReported: "のGDPは当局が公表した公式値です",
    stale: "古いデータ · ",
    staleBody: "産業データの最終取得日",
    staleTail: "（6か月以上前）。更新するには",
    staleEnd: "を実行し、公式資料から取り直してください。",
    latestLead: "各国は、その出典が公表している最新のデータを使っています。",
    isWord: "は",
    newer:
      "それらより新しい産業内訳は、まだ取り込んでいません。数値は入手できる最新のもので、年を揃えるために遅らせてはいません。",
    showingLatest: "表示しているのは次の国の最新データです。",
    othersUpTo: "この画面の他国は最大",
    seriesNotUpdated: "この系列は出典側でそれ以上更新されていません。",
    sources: "出典：",
    dataAsOf: "データ取得日",
    breadcrumb: "階層",
    back: "戻る",
    goBack: "一つ戻る",
    noAmounts: "表示できる金額がありません",
    offset: "控除",
    inflationWord: "インフレ",
    realWord: "実質",
    infl: "インフレ",
    source: "出典",
    tapOpen: "タップして開く",
    noDetail: "これ以上の内訳はありません",
    hatch:
      "斜線は上の合計から差し引かれる控除です。円グラフの区分には加えず、純額を減らします。",
    of: "に占める割合",
    contested: "警告",
    counterpoint: "反論",
    remove: "外す",
    fromComparison: "比較から外す",
    openDetails: "内訳を開く",
    cap: "/人",
    tenY: "10年",
    nominalTitle: "名目GDPの5年変化",
    realTitle: "実質GDP。名目成長からインフレを引いた値",
    cpiDrag: "累積CPI。実質GDPでは差し引きます",
    cpiPrefix: "累積CPI · ",
    derivedFrom: "算出元",
    notPeer: "÷人口。名目米ドルの他国とは比べられません",
    pcapIndustry: "米ドル。産業合計÷人口",
    pcapWb: "変化率は世界銀行の1人当たりGDP",
    pcapPlain: "産業合計÷人口",
    srcBea: "米BEA",
    srcEsri: "内閣府ESRI",
    srcStatcan: "カナダ統計局",
    srcAbs: "豪州統計局",
    srcEurostat: "ユーロスタット",
    srcWorldbank: "世界銀行",
    srcOecd: "OECD",
    compareHint: "別の旗をタップすると、2か国を横に並べて比較できます。",
    compare: "比較",
    exitCompare: "比較を終了",
    comparePick: "比較する国の旗をタップしてください。",
    selectToCompare: "比較する国を選んでください",
    compareSwitch: "2か国目を入れ替える",
    comparingHint: "別の旗をタップすると2か国目を入れ替えられます。",
    timesOther: "相手国の",
    clearCompare: "外す",
    nationalDebt: "政府総債務",
    debtPerCapita: "1人当たり債務",
    debtPerPerson: "1人当たり",
    debtHint: "一般政府総債務 · IMF",
    debtPerCapitaHint: "1人当たり一般政府総債務 · IMF",
    adjustedGdpPerCapita: "調整後の1人当たりGDP",
    adjustedHint: "名目の1人当たりGDPから、1人当たり公的債務の利払いを引いた額",
    adjustedMissing: "IMFはこの国の公的債務利払いを公表していません",
    ofGdp: "対GDP",
    afterInterest: "／年（利払い後）",
    interestWord: "利払い",
    afterInterestMissing: "利払い後 —",
    lifeExpectancy: "平均寿命",
    yearsSuffix: "歳",
    lifeHint: "出生時",
    metricSources:
      "人口、年齢構成、平均寿命、および5年のGDP変化は世界銀行の数値です。インフレは累積CPIです。政府総債務、1人当たり債務、調整後の1人当たりGDPはIMFの債務と利払いです。10年の数値は国債の利回りです。1人当たりGDPは産業合計を人口で割った値です。",
    empty: "—",
  },
} as const;

export type MessageKey = keyof (typeof messages)["en"];

const SOURCE_SUMMARY_JA: Record<string, string> = {
  esri: "内閣府の経済活動別GDP（名目、暦年）。産業の合計に、公表されている輸入税、総固定資本形成に係る消費税、統計上の不突合を加えると名目GDPになります。",
  bea: "BEAの産業別GDP（名目、季節調整済み年率）。名目米ドルのGDPに最も近い系列です。",
  worldbank: "世界銀行の名目米ドルGDPと部門別付加価値です。",
  eurostat:
    "ユーロスタットの名目粗付加価値（B1G）です。生産物への税から補助金を除いた額を含まないため、市場価格のGDPより小さくなります。",
  oecd: "OECD表6の名目粗付加価値です。ユーロスタットの粗付加価値に近く、市場価格のGDPとは異なります。",
  statcan:
    "カナダ統計局の基本価格GDP、2017年連鎖ドル（数量）です。市場為替で換算しても名目米ドルGDPにはなりません。",
  abs: "豪州統計局の連鎖数量の粗付加価値です。名目金額ではないため、名目米ドルGDPとは比べられません。",
};

const BADGE_JA: Record<string, string> = {
  "Nominal GDP": "名目GDP",
  "GVA (not GDP)": "GVA（GDPではない）",
  "Volume ≠ $": "数量≠金額",
};

const CONTESTED_JA: Record<string, ContestedField> = {
  population: {
    field: "population",
    severity: "high",
    title: "公式の人口には異論があります",
    why: "中国の世界銀行人口は国家統計局の公表値から作られています。独立した人口研究者は、予算や計画上の誘因から出生数と総人口が系統的に過大だと主張し、その差の大きさには反論もあります。",
    officialLabel: "公式／世界銀行（国家統計局ベース）",
    alternatives: [
      {
        label: "易富賢（ウィスコンシン大学マディソン校）",
        value: "約12.8億人",
        yearLabel: "2020–23年頃の公式約14.1億人との対比",
        note: "公式のセンサス／国家統計局より約1億〜1.3億人少ないと推計し、1990年代以降の過大計上を主張しています。",
        url: "https://www.reuters.com/world/china/researcher-questions-chinas-population-data-says-it-may-be-lower-2021-12-03/",
      },
      {
        label: "易富賢（2023–24年の論評）",
        value: "公式より約1.3億人少ない",
        yearLabel: "2023年の公式約14.1億人に対して",
        note: "2023年に公表された14.1億人より、実際は約1.3億人少ないという主張を維持しています。",
        url: "https://www.newsweek.com/china-hiding-population-secret-1926834",
      },
    ],
    counterpoints: [
      {
        label: "王豊（カリフォルニア大学アーバイン校）",
        note: "2000年以降のセンサスについて、中国と国連の分析では1億人超の過大計上が確認されていないと論じています。",
        url: "https://www.socsci.uci.edu/newsevents/news/2024/2024-07-17-wang-feng-newsweek.php",
      },
    ],
  },
  gdp: {
    field: "gdp",
    severity: "high",
    title: "公式のGDP成長率は広く疑われています",
    why: "中国のグラフ上のGDPは、国家統計局の国民経済計算に沿った世界銀行の名目米ドル系列です。独立した追跡機関は、特に不動産不況の後、公式成長率が実体を系統的に上回るとし、米ドル建ての水準も過大であり得ると指摘しています。",
    officialLabel: "国家統計局の公式値（世界銀行経由）",
    alternatives: [
      {
        label: "ライディアム・グループ",
        value: "2024年の成長率 約2.4–2.8%",
        yearLabel: "公式の約5%との対比",
        note: "2024年のGDP成長率を2.4–2.8%と推計し、約5%という公式の主張を大きく下回ります。",
        url: "https://rhg.com/research/after-the-fall-chinas-economy-in-2025/",
      },
      {
        label: "ライディアム・グループ",
        value: "2023年の成長率 約1.5%",
        yearLabel: "公式の5.2%との対比",
        note: "2023年の基本推計は約1.5%で、公式の5.2%と対照的です。",
        url: "https://rhg.com/wp-content/uploads/2024/02/Through-the-Looking-Glass-Chinas-2023-GDP-and-the-Year-Ahead-1.pdf",
      },
      {
        label: "ライディアム／引用された中国の経済学者",
        value: "経済規模が約10%小さい（約1.7兆ドル）",
        yearLabel: "累積の過大計上",
        note: "成長率が3年にわたり約3ポイント過大なら、GDP水準は公式より約10%（約1.7兆ドル）低いことになります。",
        url: "https://rhg.com/research/after-the-fall-chinas-economy-in-2025/",
      },
    ],
  },
  gdpPerCapita: {
    field: "gdpPerCapita",
    severity: "high",
    title: "1人当たりGDPは両方の偏りを受けます",
    why: "1人当たりは、公式系列のGDPを公式系列の人口で割った値です。GDPが過大でも人口が過大でも比はどちらにも動き得るため、独立に確認された生活水準ではなく公式系列の構成値として見てください。",
    officialLabel: "公式GDP ÷ 公式人口",
    alternatives: [
      {
        label: "含意（易富賢の人口）",
        value: "人口が少なければ1人当たりは高くなる",
        yearLabel: "例示",
        note: "人口が約1億〜1.3億人少なければ、同じGDPでも1人当たりは上がります。ライディアム型の低いGDPは逆方向です。",
        url: "https://www.reuters.com/world/china/researcher-questions-chinas-population-data-says-it-may-be-lower-2021-12-03/",
      },
    ],
  },
  ageStructure: {
    field: "ageStructure",
    severity: "medium",
    title: "年齢構成も国家統計局の入力に沿っています",
    why: "中国の世界銀行の0–14歳と65歳以上の割合は、同じ国家統計の体系から作られています。出生が過大なら、若年の割合も過大であり得ます。",
    officialLabel: "世界銀行（国家統計局ベース）",
    alternatives: [
      {
        label: "易富賢による出生率への批判",
        value: "出生率はより低く、出生数はより少ない",
        yearLabel: "長期",
        note: "公表された出生率は膨らんでおり、公式の年齢構成より18歳未満の割合は小さくなると主張しています。",
        url: "https://www.reuters.com/world/china/researcher-questions-chinas-population-data-says-it-may-be-lower-2021-12-03/",
      },
    ],
  },
};

function trimZeros(value: string): string {
  return value.replace(/\.?0+$/, "");
}

function formatJaMoney(amountMillions: number, compact = false): string {
  const sign = amountMillions < 0 ? "-" : "";
  const dollars = Math.abs(amountMillions) * 1_000_000;
  if (dollars >= 1e12) {
    return `${sign}${trimZeros((dollars / 1e12).toFixed(compact ? 2 : 3))}兆ドル`;
  }
  if (dollars >= 1e8) {
    const oku = dollars / 1e8;
    const decimals = oku >= 100 ? (compact ? 0 : 1) : compact ? 1 : 2;
    return `${sign}${trimZeros(oku.toFixed(decimals))}億ドル`;
  }
  if (dollars >= 1e4) {
    return `${sign}${trimZeros((dollars / 1e4).toFixed(1))}万ドル`;
  }
  return `${sign}${Math.round(dollars).toLocaleString("ja-JP")}ドル`;
}

function formatJaPeople(n: number): string {
  if (n >= 100_000_000) return `${trimZeros((n / 100_000_000).toFixed(2))}億人`;
  if (n >= 10_000) return `${trimZeros((n / 10_000).toFixed(1))}万人`;
  return `${Math.round(n).toLocaleString("ja-JP")}人`;
}

type I18n = {
  locale: Locale;
  ja: boolean;
  toggleJa: () => void;
  t: (key: MessageKey) => string;
  label: (name: string, id?: string) => string;
  money: (amountMillions: number, compact?: boolean) => string;
  people: (n: number) => string;
  perCapitaUsd: (usd: number) => string;
  delta: (text: string) => string;
  list: (items: string[]) => string;
  badge: (badge: string) => string;
  sourceSummary: (sourceKey: string, english: string) => string;
  contested: (field: ContestedField) => ContestedField;
};

const LocaleContext = createContext<I18n | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>("en");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "ja") setLocale("ja");
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    localStorage.setItem(STORAGE_KEY, locale);
    document.documentElement.lang = locale;
    document.title = messages[locale].title;
  }, [locale, ready]);

  const value = useMemo<I18n>(() => {
    const ja = locale === "ja";
    return {
      locale,
      ja,
      toggleJa: () => setLocale((prev) => (prev === "ja" ? "en" : "ja")),
      t: (key) => messages[locale][key],
      label: (name, id) => {
        if (!ja) return name;
        if (id && JA_BY_ID[id]) return JA_BY_ID[id];
        const selected = name.match(/^Selected economies \((\d+)\)$/);
        if (selected) return `主な経済（${selected[1]}）`;
        return (jaNames as Record<string, string>)[name] ?? name;
      },
      money: (amount, compact = false) =>
        ja ? formatJaMoney(amount, compact) : formatMillions(amount, compact),
      people: (n) => (ja ? formatJaPeople(n) : formatPopulation(n)),
      perCapitaUsd: (usd) =>
        ja
          ? `${Math.round(usd).toLocaleString("ja-JP")}ドル`
          : formatUsdPerCapita(usd),
      delta: (text) =>
        ja ? text.replace("(5yr)", "（5年）").replace(" yr ", "年") : text,
      list: (items) => items.join(ja ? "、" : ", "),
      badge: (badge) => (ja ? (BADGE_JA[badge] ?? badge) : badge),
      sourceSummary: (sourceKey, english) =>
        ja ? (SOURCE_SUMMARY_JA[sourceKey] ?? english) : english,
      contested: (field) => (ja ? (CONTESTED_JA[field.field] ?? field) : field),
    };
  }, [locale]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useI18n(): I18n {
  const value = useContext(LocaleContext);
  if (!value) throw new Error("useI18n must be used inside LocaleProvider");
  return value;
}

export function YoshinobuButton() {
  const { ja, toggleJa } = useI18n();
  return (
    <button
      type="button"
      onClick={toggleJa}
      aria-pressed={ja}
      title={ja ? "英語に戻す" : "日本語に切り替える"}
      className={`shrink-0 rounded-md border px-3 py-1.5 text-sm font-semibold transition ${
        ja
          ? "border-[#1f3d4d] bg-[#1f3d4d] text-[#f7f3ec]"
          : "border-[#d4c8b4] bg-[#fbf8f2] text-[#1f3d4d] hover:border-[#1f3d4d] hover:bg-[#ebe4d8]"
      }`}
    >
      ヨシノブへ
    </button>
  );
}
