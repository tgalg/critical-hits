import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Critical Hits",
  description: "A home for the games you play and the stories you share.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
