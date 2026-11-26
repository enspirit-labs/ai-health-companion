import type { Metadata } from "next";
import { DM_Mono, Instrument_Sans, Lora } from "next/font/google";
import "./globals.css";

import { AppBackground } from "@/components/app-background";
import { Providers } from "@/components/providers";
import { Toaster } from "@/components/ui/sonner";
import { WellnessDisclaimer } from "@/components/wellness-disclaimer";

const instrumentSans = Instrument_Sans({
  variable: "--font-instrument-sans",
  subsets: ["latin"],
});

// Reserved for small caption/data-style text (tracked uppercase labels,
// code-like content) — never for headings, which use Instrument Sans.
const dmMono = DM_Mono({
  variable: "--font-dm-mono",
  weight: ["400", "500"],
  subsets: ["latin"],
});

// Editorial accent font for short brand-voice phrases, always italic.
const lora = Lora({
  variable: "--font-lora",
  style: ["italic"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "AI Health Companion",
    template: "%s | AI Health Companion",
  },
  description:
    "AI-guided wellness self-assessment for individuals. Answer a few questions, understand your wellness today. Not a substitute for medical advice.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${instrumentSans.variable} ${dmMono.variable} ${lora.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground"
        >
          Skip to content
        </a>
        <Providers>
          <AppBackground />
          <div className="flex-1 flex flex-col">{children}</div>
          <WellnessDisclaimer />
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}
