import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const API = process.env.TOKENMOTH_API_URL ?? process.env.NEXT_PUBLIC_TOKENMOTH_API_URL ?? "http://localhost:8080";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const r = await fetch(`${API}/v1/keys/${encodeURIComponent(params.id)}/revoke`, {
    method: "POST",
    headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
  });
  return new NextResponse(r.ok ? null : await r.text(), { status: r.status });
}
