import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import "./globals.css";

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "700", "800"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "tokenrat — Claude Code token tracker",
  description: "Track, aggregate and visualize Claude Code token usage & cost per repo.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={jetbrainsMono.variable}>
      <body className="font-mono bg-charcoal text-white antialiased">{children}</body>
    </html>
  );
}
