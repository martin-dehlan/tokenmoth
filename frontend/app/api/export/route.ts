import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Proxy → /v1/export with the user's JWT; passes through the download headers.
const API = process.env.TOKENMOTH_API_URL ?? process.env.NEXT_PUBLIC_TOKENMOTH_API_URL ?? "http://localhost:8080";

export async function GET(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const qs = req.nextUrl.searchParams.toString();
  const r = await fetch(`${API}/v1/export?${qs}`, {
    headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
    cache: "no-store",
  });
  const body = await r.arrayBuffer();
  const headers = new Headers();
  headers.set("content-type", r.headers.get("content-type") ?? "application/octet-stream");
  const cd = r.headers.get("content-disposition");
  if (cd) headers.set("content-disposition", cd);
  return new NextResponse(body, { status: r.status, headers });
}
