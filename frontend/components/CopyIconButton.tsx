"use client";

// Small copy affordance pinned to the top-right of a command field — the
// familiar "copy" glyph that flips to a check on success. Presentational only:
// the parent owns the copy() call and the `copied` flash state so click
// analytics / clipboard-fallback handling stay in one place.
export default function CopyIconButton({
  onClick,
  copied,
  className = "",
}: {
  onClick: () => void;
  copied: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={copied ? "copied" : "copy command"}
      title={copied ? "copied" : "copy"}
      className={`absolute top-2 right-2 grid h-7 w-7 place-items-center rounded-btn border border-line bg-surface text-muted shadow-track transition-colors hover:text-ink active:translate-y-px ${className}`}
    >
      {copied ? (
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" aria-hidden>
          <path
            d="M3.5 8.5l3 3 6-7"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : (
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" aria-hidden>
          <rect x="5" y="5" width="8" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
          <path
            d="M11 5V3.5A1.5 1.5 0 009.5 2H4a2 2 0 00-2 2v6.5A1.5 1.5 0 003.5 12"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
          />
        </svg>
      )}
    </button>
  );
}
