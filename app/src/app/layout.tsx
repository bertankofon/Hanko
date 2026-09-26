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
    <html lang="tr">
      <body>
        <div className="mx-auto max-w-6xl px-4 py-6">
          <header className="mb-1 flex items-baseline gap-3">
            <Link href="/system" className="flex items-baseline gap-2.5">
              <span className="flex size-7 items-center justify-center rounded-full border-2 border-seal text-[13px] font-bold text-seal">
                判
              </span>
              <span className="text-lg font-semibold tracking-tight">Hanko</span>
            </Link>
            <span className="text-sm text-muted">
              tokenize hisse havuzları için süreli, iptal edilebilir onchain mühür
            </span>
          </header>
          <TabNav />
          <main className="py-6">{children}</main>
          <footer className="border-t border-line pt-4 text-xs text-muted">
            ETHGlobal Tokyo 2026 · Sepolia · Her durum zincirden okunur, hiçbir değer sabit yazılmamıştır.
          </footer>
        </div>
      </body>
    </html>
  );
}
