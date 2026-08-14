import type { Metadata, Viewport } from "next";
import "@fontsource/bebas-neue/400.css";
import "@fontsource/ibm-plex-sans-arabic/400.css";
import "@fontsource/ibm-plex-sans-arabic/500.css";
import "@fontsource/ibm-plex-sans-arabic/600.css";
import "@fontsource-variable/manrope";
import "./globals.css";

export const metadata: Metadata = {
  title: "MJ Hair Salon",
  description:
    "MJ Hair Salon by Mustafa Alkhateeb — precision grooming and modern care in Amman.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/assets/mj-logo.jpeg",
    shortcut: "/assets/mj-logo.jpeg",
    apple: "/assets/mj-logo.jpeg",
  },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "MJ Control",
  },
};

export const viewport: Viewport = {
  themeColor: "#07131c",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
