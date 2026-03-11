import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "A-Eyes - 視覚障害者向けAIアシスタント",
  description: "AI-powered accessibility assistant for visually impaired users",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className="antialiased bg-black text-white min-h-screen">
        {children}
      </body>
    </html>
  );
}
