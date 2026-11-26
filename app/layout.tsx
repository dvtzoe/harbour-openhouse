import type { Metadata, Viewport } from "next";
import "./globals.css";
import { TuiNav } from "./components/tui-nav";

export const metadata: Metadata = {
  title: "Harbour.Space@UTCC Open House",
  description: "Open house challenge: four activities, one leaderboard.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0000aa",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;700&display=swap"
        />
      </head>
      <body className="crt">
        <TuiNav />
        {children}
      </body>
    </html>
  );
}
