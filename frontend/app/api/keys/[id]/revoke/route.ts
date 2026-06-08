import { NextResponse } from "next/server";

const API = process.env.TOKENMOTH_API_URL ?? "http://localhost:8080";
const ADMIN = process.env.TOKENMOTH_ADMIN_TOKEN ?? "";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const r = await fetch(`${API}/v1/keys/${encodeURIComponent(params.id)}/revoke`, {
    method: "POST",
    headers: { Authorization: `Bearer ${ADMIN}` },
  });
  return new NextResponse(r.ok ? null : await r.text(), { status: r.status });
}
