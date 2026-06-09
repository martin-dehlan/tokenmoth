import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

// OAuth redirect target. Sets session cookies DIRECTLY on the redirect response
// (cookies via next/headers don't reliably attach to a redirect) and uses the
// public host from x-forwarded-host (the Lambda's own origin is localhost).
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  const forwardedHost = request.headers.get("x-forwarded-host");
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  const base = forwardedHost ? `${proto}://${forwardedHost}` : request.nextUrl.origin;

  if (!code) {
    return NextResponse.redirect(`${base}/login?error=missing_code`);
  }

  const response = NextResponse.redirect(`${base}${next}`);
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
    return NextResponse.redirect(`${base}/login?error=${encodeURIComponent(error.message)}`);
  }
  return response;
}
