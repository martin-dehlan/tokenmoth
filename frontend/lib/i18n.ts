// Locale config for the public legal pages. Default is English; German is
// offered via a /de path prefix. Keep this list small — it drives static
// generation and the middleware redirect of bare legal paths.

export const locales = ["en", "de"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";

export function isLocale(x: string): x is Locale {
  return (locales as readonly string[]).includes(x);
}

export const localeLabel: Record<Locale, string> = {
  en: "EN",
  de: "DE",
};

// Legal routes that exist under every locale (also used by the middleware
// allowlist + bare-path redirect).
export const legalSlugs = ["impressum", "datenschutz", "agb", "widerruf"] as const;

// Pull the locale out of a pathname like `/de/impressum`; falls back to default.
export function localeFromPath(pathname: string): Locale {
  const seg = pathname.split("/")[1] ?? "";
  return isLocale(seg) ? seg : defaultLocale;
}
