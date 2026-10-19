"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

// A sideways-scrolling list without a visible scrollbar: touch screens swipe,
// and devices with a mouse attached get arrow buttons that page through it, shown only
// while there is more to see in that direction.
export function ScrollRow({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  const list = useRef<HTMLUListElement>(null);
  const [more, setMore] = useState({ back: false, forward: false });

  useEffect(() => {
    const el = list.current;
    if (!el) return;
    const update = () =>
      setMore({
        back: el.scrollLeft > 1,
        forward: el.scrollLeft + el.clientWidth < el.scrollWidth - 1,
      });
    update();
    el.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, []);

  const page = (direction: 1 | -1) => {
    const el = list.current;
    if (!el) return;
    el.scrollBy({ left: direction * el.clientWidth * 0.8, behavior: "smooth" });
  };

  return (
    <div className="group/row relative">
      <ul
        ref={list}
        className={cn(
          // Fade covers out at the edges rather than cutting them off.
          "scrollbar-none overflow-x-auto [mask-image:linear-gradient(to_right,transparent,black_1.5rem,black_calc(100%-1.5rem),transparent)]",
          className,
        )}
      >
        {children}
      </ul>
      <ArrowButton
        direction={-1}
        label={`Scroll ${label} back`}
        visible={more.back}
        onClick={() => page(-1)}
      />
      <ArrowButton
        direction={1}
        label={`Scroll ${label} forward`}
        visible={more.forward}
        onClick={() => page(1)}
      />
    </div>
  );
}

function ArrowButton({
  direction,
  label,
  visible,
  onClick,
}: {
  direction: 1 | -1;
  label: string;
  visible: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cn(
        // Covers sit above their titles, so centre on the cover, not the row.
        "absolute top-[38%] hidden size-10 -translate-y-1/2 items-center justify-center rounded-full border bg-background/90 text-foreground shadow-lg backdrop-blur transition any-pointer-fine:flex hover:bg-primary hover:text-primary-foreground",
        direction === -1 ? "-left-3" : "-right-3",
        visible
          ? "opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100"
          : "invisible",
      )}
    >
      <svg
        viewBox="0 0 24 24"
        className="size-5"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d={direction === -1 ? "M15 18l-6-6 6-6" : "M9 18l6-6-6-6"} />
      </svg>
    </button>
  );
}
