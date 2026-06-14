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
    // Store the IANA name RAW (no encodeURIComponent): every legal tz char
    // (A-Z a-z 0-9 _ + - /) is a valid cookie octet, and the server's tz regex
    // rejects "%". Encoding broke the `current === tz` guard above (it reads the
    // raw cookie back), so refresh fired on every load — flipping charts UTC→
    // local and replaying their draw-in, which looked like the page loading
    // twice. Raw value → guard matches → refresh only on a real zone change.
    document.cookie = `tz=${tz}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  }, [router]);
  return null;
}
