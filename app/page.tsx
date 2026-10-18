import { Card, CardContent } from "@/components/ui/card";

export default function Home() {
  return (
    <main className="flex min-h-svh items-center justify-center px-6 py-16">
      <Card className="w-full max-w-2xl">
        <CardContent className="space-y-6 p-8 sm:p-12">
          <p className="text-sm font-medium tracking-widest text-primary uppercase">
            Your next favorite game starts here
          </p>
          <h1 className="text-5xl font-semibold tracking-tight sm:text-6xl">
            Critical Hits
          </h1>
          <p className="max-w-lg text-lg leading-relaxed text-muted-foreground">
            Keep a diary of the games you play. Share your reviews, build your
            backlog, and discover what your friends are playing.
          </p>
          <p className="text-sm text-muted-foreground">Coming soon.</p>
        </CardContent>
      </Card>
    </main>
  );
}
