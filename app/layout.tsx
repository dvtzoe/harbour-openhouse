import type { Metadata, Viewport } from "next";
import "./globals.css";
import { TuiNav } from "./components/tui-nav";
import { I18nProvider } from "./components/i18n";
import { getLocale, getMessages, serverT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await serverT();
  return { title: t("meta.title"), description: t("meta.description") };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0000aa",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const [locale, messages] = await Promise.all([getLocale(), getMessages()]);
  return (
    <html lang={locale}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* Plex Mono has no Thai glyphs: Thai text falls back to Plex Sans Thai Looped (same type family). */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;700&family=IBM+Plex+Sans+Thai+Looped:wght@400;700&display=swap"
        />
      </head>
      <body className="crt">
        <I18nProvider initialLocale={locale} messages={messages}>
          <TuiNav />
          {children}
        </I18nProvider>
      </body>
    </html>
  );
}
