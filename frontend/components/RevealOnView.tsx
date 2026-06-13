"use client";

import type { ReactNode } from "react";
import { useInViewOnce } from "@/lib/useInViewOnce";

// Renders a single container element that flips `data-reveal` from "out" to "in"
// the first time it scrolls into view. Drop it in *as* a list/bar container (it
// replaces the wrapping <div>, so its children are direct children) and the CSS
// in globals.css grows the bars inside, staggered. (#204)
//
// Server-safe: before hydration data-reveal="out" and bars render at their final
// width, so there's no flash; the grow only plays once, on first reveal.
export default function RevealOnView({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  const [ref, inView] = useInViewOnce<HTMLDivElement>();
  return (
    <div ref={ref} data-reveal={inView ? "in" : "out"} className={className}>
      {children}
    </div>
  );
}
