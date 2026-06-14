import { cookies } from "next/headers";

// Viewer's IANA timezone, read from the `tz` cookie that <TimezoneCookie> sets
// client-side on first load. Used to bucket/label charts in local time during
// server rendering (where the ambient timezone is the server's, i.e. UTC).
// Defaults to "UTC" until the cookie is present, and validates the format so a
// tampered cookie can't reach the API as anything but a plausible tz name.
export function getTimezone(): string {
  const tz = cookies().get("tz")?.value;
  return tz && /^[A-Za-z0-9_+\-/]{1,64}$/.test(tz) ? tz : "UTC";
}
