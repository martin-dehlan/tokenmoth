import { NextRequest, NextResponse } from "next/server";

// Server-side proxy so the admin token never reaches the browser.
const API = process.env.TOKENMOTH_API_URL ?? "http://localhost:8080";
const ADMIN = process.env.TOKENMOTH_ADMIN_TOKEN ?? "";

function passthrough(body: string, status: number) {
  return new NextResponse(body, {
    status,
    headers: { "content-type": "application/json" },
  });
}

export async function GET() {
  const r = await fetch(`${API}/v1/keys`, {
    headers: { Authorization: `Bearer ${ADMIN}` },
    cache: "no-store",
  });
  return passthrough(await r.text(), r.status);
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  const r = await fetch(`${API}/v1/keys`, {
    method: "POST",
    headers: { Authorization: `Bearer ${ADMIN}`, "content-type": "application/json" },
    body,
  });
  return passthrough(await r.text(), r.status);
}
