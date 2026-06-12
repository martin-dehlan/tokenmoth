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

function PageviewTracker({ enabled }: { enabled: boolean }) {
  const pathname = usePathname();
  const search = useSearchParams();
  useEffect(() => {
    // `enabled` flips to true right after consent is granted (and posthog is
    // initialized), so the page the user consented on is captured too.
    if (enabled && KEY && readConsent() === "granted") {
      posthog.capture("$pageview", { $current_url: window.location.href });
    }
  }, [enabled, pathname, search]);
  return null;
}

// No-ops cleanly when NEXT_PUBLIC_POSTHOG_KEY is unset.
//
// The tree is intentionally STABLE: we always wrap children in PHProvider so
// granting/withdrawing consent never changes the element type (which would
// unmount and remount the entire app, losing client state mid-flow, e.g.
// onboarding). GDPR gating is unchanged: posthog stays uninitialized and
// opted-out — no network calls — until consent is granted.
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

  return (
    <PHProvider client={posthog}>
      {KEY && (
        <Suspense fallback={null}>
          <PageviewTracker enabled={granted} />
        </Suspense>
      )}
      {children}
    </PHProvider>
  );
}
