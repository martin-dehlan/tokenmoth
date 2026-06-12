import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { defaultLocale, legalSlugs, locales } from "@/lib/i18n";

const LEGAL = new Set<string>(legalSlugs);
// Every locale-prefixed legal path is public (e.g. /en/impressum, /de/agb).
const PUBLIC_LEGAL = new Set(
  locales.flatMap((l) => legalSlugs.map((s) => `/${l}/${s}`)),
);

// Keep the Supabase session fresh on every request (writes refreshed cookies).
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;

  // Redirect bare legal paths to the default locale (e.g. /impressum → /en/impressum)
  // so old links and the default language keep working.
  const bare = path.replace(/^\//, "");
  if (LEGAL.has(bare)) {
    const url = request.nextUrl.clone();
    url.pathname = `/${defaultLocale}/${bare}`;
    return NextResponse.redirect(url);
  }

  // Public routes reachable without a session: the landing page, the legal
  // pages under every locale (Impressum/Datenschutz must be public — #111/#112),
  // and the data-transparency page (#183) — its whole point is pre-signup trust.
  const isPublic = path === "/" || path === "/data" || PUBLIC_LEGAL.has(path);

  // Gate everything the matcher covers (login + /auth/* are excluded below).
  // The root path is public: it serves the marketing landing page to guests
  // and the dashboard to authenticated users (branch lives in app/page.tsx).
  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  // Run on everything except static assets, the login page, and the auth routes.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|login|auth/|.*\\.(?:svg|png|jpg|ico)$).*)"],
};
