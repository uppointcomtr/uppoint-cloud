import type { Metadata } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";

import { defaultLocale, locales, type Locale } from "@/modules/i18n/config";
import { themeInitScript } from "@/modules/theme/theme-script";
import { ThemeProvider } from "@/modules/theme/theme-provider";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Uppoint Cloud",
  description: "cloud.uppoint.com.tr için üretim odaklı bulut platform temeli",
};

const supportedLocaleSet = new Set<Locale>(locales);

async function resolveHtmlLocale(): Promise<Locale> {
  const requestHeaders = await headers();
  const candidate = requestHeaders.get("x-uppoint-locale")?.trim().toLowerCase();
  if (candidate && supportedLocaleSet.has(candidate as Locale)) {
    return candidate as Locale;
  }

  return defaultLocale;
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const htmlLocale = await resolveHtmlLocale();

  return (
    <html lang={htmlLocale} suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
