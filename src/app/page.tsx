import GdpExplorer from "@/components/GdpExplorer";
import { LocaleProvider } from "@/i18n/locale";

export default function Home() {
  return (
    <main className="flex min-w-0 flex-1 flex-col overflow-x-clip px-5 py-6 sm:px-8 sm:py-8">
      <LocaleProvider>
        <GdpExplorer />
      </LocaleProvider>
    </main>
  );
}
