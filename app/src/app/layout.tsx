import type {Metadata} from 'next';
import Link from 'next/link';
import {TabNav} from '@/components/TabNav';
import './globals.css';

export const metadata: Metadata = {
  title: 'Hanko',
  description:
    'ENSv2-backed, expiring, revocable and delegatable access control for Uniswap v4 permissioned pools.',
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en">
      <body>
        <div className="mx-auto max-w-6xl px-4 py-6">
          <header className="mb-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            <Link href="/overview" className="flex items-center gap-2.5">
              {/* The mark rather than the lockup: the wordmark's own red is too dark to read
                  small on this background, so the name is set in the app's type instead. */}
              {/* eslint-disable-next-line @next/next/no-img-element -- fixed-size brand asset */}
              <img src="/brand/hanko-mark-trimmed.webp" alt="" className="h-7 w-auto" />
              <span className="text-lg font-semibold tracking-tight">Hanko</span>
            </Link>
            <span className="text-sm text-muted">
              expiring, revocable onchain seals for tokenized stock pools
            </span>
          </header>
          <TabNav />
          <main className="py-6">{children}</main>
          <footer className="border-t border-line pt-4 text-xs text-muted">
            ETHGlobal Tokyo 2026 · Sepolia · Every value on this page is read from chain; nothing is hard-coded.
          </footer>
        </div>
      </body>
    </html>
  );
}
