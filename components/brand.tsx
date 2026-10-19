import { Barlow_Condensed } from "next/font/google";
import { cn } from "@/lib/utils";

const wordmarkFont = Barlow_Condensed({
  subsets: ["latin"],
  weight: "800",
  style: "italic",
  display: "swap",
});

// The Crit Spark: the flash a game shows when you land a critical hit.
export function SparkMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      aria-hidden="true"
      className={cn("shrink-0 fill-primary", className)}
    >
      <path
        d="M32 2 L38.5 25.5 L62 32 L38.5 38.5 L32 62 L25.5 38.5 L2 32 L25.5 25.5 Z"
        transform="rotate(12 32 32)"
      />
    </svg>
  );
}

// Renders "Critical Hits" as the brand wordmark; the text stays readable to
// screen readers and tests because only the casing is changed with CSS.
export function Wordmark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        wordmarkFont.className,
        "tracking-tight uppercase",
        className,
      )}
    >
      Critical <span className="text-primary">Hits</span>
    </span>
  );
}
