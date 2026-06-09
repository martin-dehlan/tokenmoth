import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Client-pollable proxy → /v1/repos with the signed-in user's JWT.
const API = process.env.TOKENMOTH_API_URL ?? "http://localhost:8080";

export async function GET(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const since = req.nextUrl.searchParams.get("since") ?? "all";
  const r = await fetch(`${API}/v1/repos?since=${encodeURIComponent(since)}`, {
    headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
    cache: "no-store",
  });
  return new NextResponse(await r.text(), {
    status: r.status,
    headers: { "content-type": "application/json" },
  });
}
