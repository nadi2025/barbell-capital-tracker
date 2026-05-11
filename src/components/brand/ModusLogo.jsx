/**
 * ModusLogo — renders the official Modus stacked lockup or mark.
 * Uses the supplied SVGs (never re-draws the calligraphic mark).
 *
 * Variants:
 *  - "stacked-ink"   : full lockup on light backgrounds (default)
 *  - "stacked-paper" : full lockup on dark backgrounds
 *  - "mark-ink"      : just the mark on light
 *  - "mark-paper"    : just the mark on dark
 *  - "wordmark-ink"  : just MODUS wordmark on light
 *  - "wordmark-paper": just MODUS wordmark on dark
 */

const SOURCES = {
  "stacked-ink": "https://media.base44.com/images/public/69d74791c11d32cf3e858a9d/4b5773b4e_logo-stacked-ink.svg",
  "stacked-paper": "https://media.base44.com/images/public/69d74791c11d32cf3e858a9d/8ffda0b7d_logo-stacked-paper.svg",
  "mark-ink": "https://media.base44.com/images/public/69d74791c11d32cf3e858a9d/02346c015_mark-ink.svg",
  "mark-paper": "https://media.base44.com/images/public/69d74791c11d32cf3e858a9d/431684e57_mark-paper.svg",
  "wordmark-ink": "https://media.base44.com/images/public/69d74791c11d32cf3e858a9d/d3f836074_wordmark-ink.svg",
  "wordmark-paper": "https://media.base44.com/images/public/69d74791c11d32cf3e858a9d/14a6756f5_wordmark-paper.svg",
};

export default function ModusLogo({ variant = "stacked-ink", height = 48, className = "" }) {
  const src = SOURCES[variant] || SOURCES["stacked-ink"];
  return (
    <img
      src={src}
      alt="Modus"
      height={height}
      style={{ height: `${height}px`, width: "auto" }}
      className={className}
      draggable={false}
    />
  );
}