import type { Metadata } from "next";
import { Geist, Geist_Mono, Source_Serif_4 } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const sourceSerif = Source_Serif_4({ variable: "--font-source-serif", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "AI Chess Coach",
  description: "Upload your games and get Stockfish-powered move analysis.",
};

const NAV_ITEMS = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Upload", href: "/" },
  { label: "My Games", href: "/games" },
  { label: "Analysis", href: null },
  { label: "My Chess DNA", href: "/chess-dna" },
  { label: "Training", href: null },
  { label: "Progress", href: null },
  { label: "AI Coach", href: null },
  { label: "Settings", href: null },
  { label: "Profile", href: null },
];

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${sourceSerif.variable} h-full antialiased`}
    >
      <body className="flex min-h-full bg-background text-foreground">
        <aside className="flex w-60 shrink-0 flex-col bg-sidebar-bg px-4 py-6">
          <span className="mb-8 px-2 font-serif text-lg text-sidebar-text">AI Chess Coach</span>
          <nav className="flex flex-col gap-1">
            {NAV_ITEMS.map((item) =>
              item.href ? (
                <Link
                  key={item.label}
                  href={item.href}
                  className="rounded px-3 py-2 text-sm text-sidebar-text hover:bg-sidebar-active"
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  key={item.label}
                  className="flex items-center justify-between rounded px-3 py-2 text-sm text-sidebar-muted"
                >
                  {item.label}
                  <span className="rounded bg-sidebar-active px-1.5 py-0.5 text-[10px]">Soon</span>
                </span>
              )
            )}
          </nav>
        </aside>
        <main className="flex flex-1 flex-col overflow-x-hidden">{children}</main>
      </body>
    </html>
  );
}