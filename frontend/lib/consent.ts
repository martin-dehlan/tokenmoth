// Consent state for non-essential cookies/tracking (§25 TDDDG).
// Only the "analytics" category is optional here (PostHog). Essential cookies
// (Supabase auth/session) need no consent and are always allowed.

export type Consent = "granted" | "denied";

export const CONSENT_KEY = "tm_consent_v1";
/** Fired when consent changes or the settings dialog should reopen. */
export const CONSENT_EVENT = "tm:consent";
/** Dispatched by the footer "Cookie-Einstellungen" link to reopen the banner. */
export const CONSENT_REOPEN_EVENT = "tm:consent-reopen";

export function readConsent(): Consent | null {
  if (typeof window === "undefined") return null;
  const v = window.localStorage.getItem(CONSENT_KEY);
  return v === "granted" || v === "denied" ? v : null;
}

export function writeConsent(value: Consent) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CONSENT_KEY, value);
  window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: value }));
}

export function reopenConsent() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(CONSENT_REOPEN_EVENT));
}
