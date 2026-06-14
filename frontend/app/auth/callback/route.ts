import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

// OAuth redirect target. Sets session cookies DIRECTLY on the redirect response
// (cookies via next/headers don't reliably attach to a redirect).
//
// Redirects use a RELATIVE Location header instead of an absolute URL. Supabase
// sets the session cookie host-only (no Domain), so it's scoped to the exact
// public host the browser used for this request. The browser resolves a
// relative Location against that same URL, guaranteeing the next page lands on
// the cookie's host. Reconstructing an absolute host from x-forwarded-host (the
// Lambda's own origin is localhost) risked diverging from the cookie's host —
// apex vs www, custom domain vs *.amplifyapp.com — dropping the just-set
// session and forcing a second sign-in (#192).
function redirect(location: string, cookieSource?: NextResponse) {
  const res = new NextResponse(null, { status: 303, headers: { location } });
  // Carry over any cookies Supabase wrote onto the working response.
  if (cookieSource) for (const c of cookieSource.cookies.getAll()) res.cookies.set(c);
  return res;
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  // Open-redirect guard: only accept same-origin paths. A value like
  // "@evil.com" or "//evil.com" would otherwise change the redirect host.
  const rawNext = searchParams.get("next") ?? "/";
  const next =
    rawNext.startsWith("/") && !rawNext.startsWith("//") && !rawNext.startsWith("/\\")
      ? rawNext
      : "/";

  if (!code) {
    return redirect("/login?error=missing_code");
  }

  const response = NextResponse.next();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }
  // Carry the session cookies Supabase just wrote onto the relative redirect.
  return redirect(next, response);
}
