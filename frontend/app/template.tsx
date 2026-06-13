// A template re-mounts on every navigation (unlike layout), so this wrapper's
// enter animation replays on each route change — turning the hard cut between
// pages into a short fade. (#206)
//
// Opacity only, on purpose: a transform here would establish a containing block
// and break sticky/fixed descendants (e.g. TopRail) for the duration. Reduced
// motion is handled globally in globals.css.
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
