import type { Metadata } from "next";
import { Geist, Geist_Mono, Fraunces } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Display face for headlines only — body/UI text stays on Geist Sans.
// Deliberately not the same family doing both jobs.
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["opsz", "SOFT", "WONK"],
});

export const metadata: Metadata = {
  title: "Meridian — Fiat to Chain, Fully Traced",
  description:
    "One distributed trace follows a payment from a fiat rail to real on-chain settlement on Celo — with deterministic, evidence-backed diagnosis when it stalls.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body
        className="flex min-h-full flex-col bg-white text-black dark:bg-black dark:text-white"
        suppressHydrationWarning
      >
        {/* Tailwind's `dark:` variant is class-based (see globals.css), not
            OS-preference based — this restores automatic system dark mode
            without a manual toggle, and runs before paint to avoid a flash. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var m=window.matchMedia('(prefers-color-scheme: dark)');var apply=function(){document.documentElement.classList.toggle('dark',m.matches)};apply();m.addEventListener('change',apply)}catch(e){}})();",
          }}
        />
        {children}
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 z-[999] opacity-[0.05] mix-blend-overlay"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
          }}
        />
      </body>
    </html>
  );
}
