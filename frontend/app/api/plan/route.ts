import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Proxy → /v1/plan with the signed-in user's JWT: current tier, status,
// month-to-date token usage, and whether billing is configured (#33/#34).
const API = process.env.TOKENMOTH_API_URL ?? process.env.NEXT_PUBLIC_TOKENMOTH_API_URL ?? "http://localhost:8080";

export async function GET() {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const r = await fetch(`${API}/v1/plan`, {
    headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
    cache: "no-store",
  });
  return new NextResponse(await r.text(), {
    status: r.status,
    headers: { "content-type": "application/json" },
  });
}
