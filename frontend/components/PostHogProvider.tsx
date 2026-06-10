"use client";

import posthog from "posthog-js";
import { PostHogProvider as PHProvider } from "posthog-js/react";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { CONSENT_EVENT, readConsent } from "@/lib/consent";

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://eu.i.posthog.com";

let initialized = false;

// Init PostHog lazily, only after the user has granted analytics consent
// (§25 TDDDG). Starts opted-out so nothing is captured before that.
function ensureInitialized() {
  if (initialized || typeof window === "undefined" || !KEY) return;
  posthog.init(KEY, {
    api_host: HOST,
    capture_pageview: false, // we send $pageview on route change below
    person_profiles: "identified_only",
    opt_out_capturing_by_default: true,
  });
  initialized = true;
}

function PageviewTracker() {
  const pathname = usePathname();
  const search = useSearchParams();
  useEffect(() => {
    if (KEY && readConsent() === "granted") {
      posthog.capture("$pageview", { $current_url: window.location.href });
    }
  }, [pathname, search]);
  return null;
}

// No-ops cleanly when NEXT_PUBLIC_POSTHOG_KEY is unset.
export default function PostHogProvider({ children }: { children: React.ReactNode }) {
  const [granted, setGranted] = useState(false);

  useEffect(() => {
    if (!KEY) return;

    const apply = () => {
      const consent = readConsent();
      if (consent === "granted") {
        ensureInitialized();
        posthog.opt_in_capturing();
        setGranted(true);
      } else {
        // Withdrawn or denied — stop capturing.
        if (initialized) posthog.opt_out_capturing();
        setGranted(false);
      }
    };

    apply();
    window.addEventListener(CONSENT_EVENT, apply);
    return () => window.removeEventListener(CONSENT_EVENT, apply);
  }, []);

  if (!KEY || !granted) return <>{children}</>;
  return (
    <PHProvider client={posthog}>
      <Suspense fallback={null}>
        <PageviewTracker />
      </Suspense>
      {children}
    </PHProvider>
  );
}
