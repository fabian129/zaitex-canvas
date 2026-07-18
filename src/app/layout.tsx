import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Zaitex Canvas",
  description: "Storyboard-canvasen: scener, shots, souls, promptkedjor och batchgrind.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="sv" className="h-full antialiased">
      <body className="min-h-full bg-zinc-950 text-zinc-100">{children}</body>
    </html>
  );
}
