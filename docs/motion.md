# Motion system (Milestone 11)

Foundation for the dashboard's animations. Sub-tasks #204 (bars), #205 (lists /
new-item) and #206 (page transitions) build on what's here; #207 owns the
prod-vs-demo restraint policy.

## Decision: CSS-first, no animation library

We stay **CSS + tiny client wrappers** (the same shape as `ChartCanvas`, which
already eases a `drawn` flag via `requestAnimationFrame`). No `framer-motion`.

Why:

- The animations we need are enter-on-mount / enter-on-scroll and width/opacity
  transitions — all expressible in CSS keyframes + transitions.
- Keeps the bundle small and most components server-rendered; only the bits that
  need viewport/seen-state detection become `"use client"`.
- Revisit only if list reordering for the new-item arrival (#205) gets ugly to
  do by hand.

## Tokens (`globals.css` `:root`)

| token | value | use |
|-------|-------|-----|
| `--motion-fast` | 160ms | small hovers, opacity |
| `--motion` | 240ms | default enter / width grow |
| `--motion-slow` | 420ms | hero / page-level |
| `--motion-stagger` | 45ms | per-row delay step |
| `--ease-out` | `cubic-bezier(.2,.7,.2,1)` | enters (decelerate) |
| `--ease-in-out` | `cubic-bezier(.5,0,.2,1)` | moves / transitions |

## `prefers-reduced-motion`

A global, **unlayered** `@media (prefers-reduced-motion: reduce)` rule at the end
of `globals.css` neutralizes all transitions/animations. Unlayered so it always
wins over `@layer components` rules — a component animation cannot override it.
Every new animation must look correct when it collapses to no movement.

## `useInViewOnce()` (`lib/useInViewOnce.ts`)

Returns `[ref, inView]`; `inView` flips true once the element first enters the
viewport, then the observer disconnects. Falls back to immediately-true with no
`IntersectionObserver` or under reduced motion, so content is never gated behind
an animation.

## Demo vs prod intensity (see #207)

Prod is calm by default. For the recording we raise intensity with a single hook
— `data-motion="full"` on `<html>` (set on the `demo/recording` branch) — that
CSS can opt into:

```css
:root[data-motion="full"] { --motion-stagger: 70ms; /* …richer for camera */ }
```

This lets the tour look lively without shipping a busy everyday app. The exact
per-animation prod/demo defaults are decided in #207.
