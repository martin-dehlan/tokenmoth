"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Captures the viewer's IANA timezone and stores it in a `tz` cookie so server
// components can bucket/label charts in local time (the server itself runs in
// UTC). On the first load — or whenever the zone changes (travel, DST handled
// server-side) — it writes the cookie and refreshes once so the next render
// uses the correct zone. Renders nothing.
export default function TimezoneCookie() {
  const router = useRouter();
  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!tz) return;
    const current = document.cookie
      .split("; ")
      .find((c) => c.startsWith("tz="))
      ?.slice(3);
    if (current === tz) return;
    document.cookie = `tz=${encodeURIComponent(tz)}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  }, [router]);
  return null;
}
