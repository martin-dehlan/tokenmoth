import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Proxy → /v1/repo-groups with the signed-in user's JWT (kept server-side).
// GET lists the user's repo groups + members; POST merges repos into a group
// (#224). DELETE lives in [group]/route.ts.
const API = process.env.TOKENMOTH_API_URL ?? process.env.NEXT_PUBLIC_TOKENMOTH_API_URL ?? "http://localhost:8080";

async function token() {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ?? "";
}

export async function GET() {
  const r = await fetch(`${API}/v1/repo-groups`, {
    headers: { Authorization: `Bearer ${await token()}` },
    cache: "no-store",
  });
  return new NextResponse(await r.text(), {
    status: r.status,
    headers: { "content-type": "application/json" },
  });
}

export async function POST(req: NextRequest) {
  const r = await fetch(`${API}/v1/repo-groups`, {
    method: "POST",
    headers: { Authorization: `Bearer ${await token()}`, "content-type": "application/json" },
    body: await req.text(),
    cache: "no-store",
  });
  return new NextResponse(await r.text(), {
    status: r.status,
    headers: { "content-type": "application/json" },
  });
}
