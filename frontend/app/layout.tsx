import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import "./globals.css";
import PostHogProvider from "@/components/PostHogProvider";
import ConsentBanner from "@/components/ConsentBanner";
import Footer from "@/components/Footer";
import TimezoneCookie from "@/components/TimezoneCookie";

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "TokenMoth — Claude Code token tracker",
  description: "Track, aggregate and visualize Claude Code token usage & cost per repo.",
};

// Set the theme class before first paint to avoid a flash: honor a saved
// choice, else fall back to the OS preference. Mirrors ThemeToggle's storage key.
const themeInit = `(function(){try{var t=localStorage.getItem('theme');var d=t?t==='dark':matchMedia('(prefers-color-scheme: dark)').matches;if(d)document.documentElement.classList.add('dark');}catch(e){}})();`;

// Demo-only motion intensity (#207): set NEXT_PUBLIC_DEMO_MOTION=full (the
// recording does) to mark <html data-motion="full"> so transitions/stagger read
// on camera. Unset in prod, so the everyday app stays calm.
const demoMotion = process.env.NEXT_PUBLIC_DEMO_MOTION === "full" ? "full" : undefined;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      data-motion={demoMotion}
      className={jetbrainsMono.variable}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body className="font-sans bg-canvas text-ink antialiased min-h-dvh flex flex-col">
        <PostHogProvider>
          <div className="flex-1 flex flex-col">{children}</div>
          <Footer />
          <ConsentBanner />
          <TimezoneCookie />
        </PostHogProvider>
      </body>
    </html>
  );
}
