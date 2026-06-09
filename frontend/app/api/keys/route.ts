import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Proxy to the API using the signed-in user's Supabase JWT → backend scopes
// keys to that user. The JWT stays server-side (httpOnly cookie → here).
const API = process.env.TOKENMOTH_API_URL ?? "http://localhost:8080";

async function userToken() {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ?? "";
}

export async function GET() {
  const r = await fetch(`${API}/v1/keys`, {
    headers: { Authorization: `Bearer ${await userToken()}` },
    cache: "no-store",
  });
  return new NextResponse(await r.text(), {
    status: r.status,
    headers: { "content-type": "application/json" },
  });
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  const r = await fetch(`${API}/v1/keys`, {
    method: "POST",
    headers: { Authorization: `Bearer ${await userToken()}`, "content-type": "application/json" },
    body,
  });
  return new NextResponse(await r.text(), {
    status: r.status,
    headers: { "content-type": "application/json" },
  });
}
