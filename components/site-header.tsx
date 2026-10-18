import Link from "next/link";

// Static on purpose: it reads no session, so pages stay cheap to render.
export function SiteHeader() {
  return (
    <header className="border-b">
      <nav
        aria-label="Main"
        className="mx-auto flex max-w-5xl items-center gap-6 px-6 py-3 text-sm"
      >
        <Link href="/" className="font-semibold tracking-tight">
          Critical Hits
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
        <Link href="/account" className="ml-auto hover:underline">
          Account
        </Link>
      </nav>
    </header>
  );
}
