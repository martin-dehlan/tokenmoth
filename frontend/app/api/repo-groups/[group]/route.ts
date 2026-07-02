import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Proxy → DELETE /v1/repo-groups/:group with the signed-in user's JWT. Unmerges
// a group (members split back to raw names); `?member=<repo>` pulls one repo out
// of the group instead (#224).
const API = process.env.TOKENMOTH_API_URL ?? process.env.NEXT_PUBLIC_TOKENMOTH_API_URL ?? "http://localhost:8080";

async function token() {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ?? "";
}

export async function DELETE(req: NextRequest, { params }: { params: { group: string } }) {
  const member = req.nextUrl.searchParams.get("member");
  const qs = member ? `?member=${encodeURIComponent(member)}` : "";
  const r = await fetch(
    `${API}/v1/repo-groups/${encodeURIComponent(params.group)}${qs}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${await token()}` },
      cache: "no-store",
    },
  );
  return new NextResponse(await r.text(), {
    status: r.status,
    headers: { "content-type": "application/json" },
  });
}
