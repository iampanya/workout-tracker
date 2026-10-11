import type { Metadata } from "next";
import { Fira_Sans, Fira_Code, IBM_Plex_Sans_Thai } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import "./globals.css";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { ACCENT_STORAGE_KEY, DEFAULT_ACCENT, THEME_ACCENTS } from "@/components/theme/accents";

// Runs before first paint to set <html data-theme> and <html data-accent> from the
// saved preferences, so there's no flash of the wrong theme or color. Kept
// dependency-free and inlined; the accent list is interpolated from accents.ts.
const THEME_INIT_SCRIPT = `(function(){try{var m=localStorage.getItem("theme");if(m!=="light"&&m!=="dark"&&m!=="system")m="system";var d=m==="dark"||(m==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.dataset.theme=d?"dark":"light";}catch(e){}try{var a=localStorage.getItem(${JSON.stringify(ACCENT_STORAGE_KEY)});if(${JSON.stringify(THEME_ACCENTS)}.indexOf(a)<0)a=${JSON.stringify(DEFAULT_ACCENT)};document.documentElement.dataset.accent=a;}catch(e){}})();`;

const firaSans = Fira_Sans({
  variable: "--font-fira-sans",
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
});

const firaCode = Fira_Code({
  variable: "--font-fira-code",
  subsets: ["latin"],
});

// Fira Sans has no Thai glyphs: Thai text falls through to Plex Thai (see --font-sans).
const plexThai = IBM_Plex_Sans_Thai({
  variable: "--font-thai",
  weight: ["400", "500", "600", "700"],
  subsets: ["thai"],
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return { title: t("title"), description: t("description") };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const locale = await getLocale();
  return (
    <html
      lang={locale}
      suppressHydrationWarning
      className={`${firaSans.variable} ${firaCode.variable} ${plexThai.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">
        <NextIntlClientProvider>
          <ThemeProvider>{children}</ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
