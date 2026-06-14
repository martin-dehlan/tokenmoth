"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

// Fires once when the element first scrolls into view, then disconnects.
// Returns a ref to attach and a flag that flips true on first intersection and
// stays true — use it to kick off enter animations on scroll instead of at
// hydration (so off-screen bars/rows animate when reached, which is what the
// recorded tour captures). (#203)
//
// Degrades to immediately "in view" when there's no IntersectionObserver or the
// user prefers reduced motion, so content is never gated behind an animation.
export function useInViewOnce<T extends Element = HTMLDivElement>(
  options: IntersectionObserverInit = { rootMargin: "0px 0px -10% 0px", threshold: 0.1 },
): [RefObject<T>, boolean] {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || inView) return;

    if (
      typeof IntersectionObserver === "undefined" ||
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ) {
      setInView(true);
      return;
    }

    const obs = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          setInView(true);
          obs.disconnect();
          break;
        }
      }
    }, options);
    obs.observe(el);
    return () => obs.disconnect();
    // Run once on mount; options/inView are intentionally not re-watched.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return [ref, inView];
}
