import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { ServiceWorkerRegister } from "./sw-register";
import { NO_FLASH_THEME_SCRIPT } from "@/lib/theme";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PCAARB — Management for Your Retail Business",
  description: "Business management SaaS with POS for small and medium retail.",
};

// Simple typing instead of `LayoutProps<"/">`: that type only exists after a
// `next build`/`next dev` generates `.next/types` — on a clean CI checkout,
// typecheck runs before the build and would break by depending on codegen.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      // The no-flash script (below) sets data-theme on this element before
      // hydration, from localStorage — a value the server can't know.
      // Standard, accepted mismatch for this exact pattern (same as
      // next-themes): React just keeps the client's DOM as-is, nothing to fix.
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH_THEME_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">
        <ServiceWorkerRegister />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
