"use client";

import posthog from "posthog-js";
import { PostHogProvider as PHProvider } from "posthog-js/react";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://eu.i.posthog.com";

if (typeof window !== "undefined" && KEY) {
  posthog.init(KEY, {
    api_host: HOST,
    capture_pageview: false, // we send $pageview on route change below
    person_profiles: "identified_only",
  });
}

function PageviewTracker() {
  const pathname = usePathname();
  const search = useSearchParams();
  useEffect(() => {
    if (KEY) posthog.capture("$pageview", { $current_url: window.location.href });
  }, [pathname, search]);
  return null;
}

// No-ops cleanly when NEXT_PUBLIC_POSTHOG_KEY is unset.
export default function PostHogProvider({ children }: { children: React.ReactNode }) {
  if (!KEY) return <>{children}</>;
  return (
    <PHProvider client={posthog}>
      <Suspense fallback={null}>
        <PageviewTracker />
      </Suspense>
      {children}
    </PHProvider>
  );
}
