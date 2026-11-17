import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ARBITER DOJO - OmniDecide WASM Fighter",
  description:
    "A 2.5D browser fighting game where the opponent's mind is the OmniDecide decision kernel running as WebAssembly. It watches what you do and learns to beat you.",
  icons: {
    icon: "/game/assets/ui/title_emblem.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased bg-black text-white">{children}</body>
    </html>
  );
}
