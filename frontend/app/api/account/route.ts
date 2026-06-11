import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// DELETE /api/account → proxies to backend DELETE /v1/me with the user's JWT,
// then signs the user out. Erases all account data (DSGVO Art. 17, #116).
const API = process.env.TOKENMOTH_API_URL ?? process.env.NEXT_PUBLIC_TOKENMOTH_API_URL ?? "http://localhost:8080";

export async function DELETE() {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  }

  const r = await fetch(`${API}/v1/me`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${session.access_token}` },
    cache: "no-store",
  });

  if (!r.ok && r.status !== 204) {
    const detail = await r.text().catch(() => "");
    return NextResponse.json(
      { error: `delete failed (${r.status})`, detail },
      { status: 502 },
    );
  }

  // Clear the local session so the user is logged out after deletion.
  await supabase.auth.signOut();
  return new NextResponse(null, { status: 204 });
}
