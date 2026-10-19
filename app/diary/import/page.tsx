import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ImportForm } from "@/components/logs/import-form";
import { getCurrentUser } from "@/lib/session";

export const metadata: Metadata = { title: "Import games · Critical Hits" };

export default async function ImportPage() {
  if (!(await getCurrentUser())) redirect("/sign-in");
  return (
    <main className="mx-auto max-w-3xl space-y-6 px-6 py-12">
      <div className="space-y-2">
        <Link href="/diary" className="text-sm underline">
          Back to your diary
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">Import games</h1>
        <p className="text-muted-foreground">
          Paste a list of games you&apos;ve finished to add them to your diary
          as finished plays. Imported plays don&apos;t show up in your
          followers&apos; feeds.
        </p>
      </div>
      <ImportForm />
    </main>
  );
}
