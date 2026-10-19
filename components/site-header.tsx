import Link from "next/link";
import { SparkMark, Wordmark } from "@/components/brand";

// Static on purpose: it reads no session, so pages stay cheap to render.
export function SiteHeader() {
  return (
    <header className="border-b">
      <nav
        aria-label="Main"
        className="mx-auto flex max-w-5xl items-center gap-3 overflow-x-auto px-4 py-3 text-sm whitespace-nowrap sm:gap-6 sm:px-6"
      >
        <Link
          href="/"
          className="flex items-center gap-1.5 text-lg leading-none whitespace-nowrap"
        >
          <SparkMark className="size-5" />
          <Wordmark />
        </Link>
        <Link href="/games" className="hover:underline">
          Games
        </Link>
        <Link href="/diary" className="hover:underline">
          Diary
        </Link>
        <Link href="/backlog" className="hover:underline">
          Backlog
        </Link>
        <Link href="/lists" className="hover:underline">
          Lists
        </Link>
        <Link href="/profile" className="ml-auto hover:underline">
          Profile
        </Link>
        <Link href="/account" className="hover:underline">
          Account
        </Link>
      </nav>
    </header>
  );
}
