import type {Metadata} from 'next';
import Link from 'next/link';
import {RoleSwitcher} from '@/components/chrome/RoleSwitcher';
import {TabNav, type Tab} from '@/components/TabNav';
import {getActors} from '@/lib/actors';
import {getViewer, ROLES} from '@/lib/role';
import {readSeals} from '@/lib/seals';
import './globals.css';

export const metadata: Metadata = {
  title: 'Hanko',
  description:
    'ENSv2-backed, expiring, revocable and delegatable access control for Uniswap v4 permissioned pools.',
};

/** Operator controls only exist for the operator; everyone else would only see refusals. */
function tabsFor(role: string): Tab[] {
  const tabs: Tab[] = [
    {href: '/overview', label: 'Overview'},
    {href: '/trade', label: 'Trade'},
    {href: '/access', label: 'Access'},
  ];
  if (role === 'operator') tabs.push({href: '/operator', label: 'Operator'});
  tabs.push({href: '/record', label: 'Record'}, {href: '/demo', label: 'Demo'});
  return tabs;
}

export default async function RootLayout({children}: {children: React.ReactNode}) {
  const viewer = await getViewer();
  const actors = getActors();

  // What each wallet holds is read here rather than baked into the role's name: the walkthrough
  // changes it, and a label that has stopped being true is worse than no label.
  const seals = await readSeals(actors.map((a) => a.address));

  const options = ROLES.map((role) => {
    const address = actors.find((a) => a.name === role.actor)?.address ?? null;
    const seal = address ? seals.get(address.toLowerCase()) : undefined;
    return {
      id: role.id,
      label: role.label,
      blurb: role.blurb,
      address,
      seal: seal?.label ?? 'unknown',
      cleared: Boolean(seal?.swap || seal?.liquidity),
    };
  });

  return (
    <html lang="en">
      <body>
        <div className="mx-auto max-w-6xl px-4 py-6">
          <header className="flex flex-wrap items-center justify-between gap-4 pb-7 pt-4">
            <div className="flex flex-wrap items-baseline gap-x-5 gap-y-2">
              <Link href="/overview" className="flex items-baseline gap-3">
                {/* The mark rather than the lockup: the wordmark's own red is too dark to read
                    small on this background, so the name is set in the app's type instead. */}
                {/* eslint-disable-next-line @next/next/no-img-element -- fixed-size brand asset */}
                <img src="/brand/hanko-mark-trimmed.webp" alt="" className="h-9 w-auto translate-y-1" />
                <span className="text-3xl font-semibold tracking-tight">Hanko</span>
              </Link>
              <span className="hidden text-base text-muted sm:inline">
                <span className="mr-4 text-line">/</span>
                Tokenized stocks, permissioned by ENS
              </span>
            </div>

            <RoleSwitcher options={options} current={viewer.id} />
          </header>

          <TabNav tabs={tabsFor(viewer.id)} />
          <main className="py-8">{children}</main>

          <footer className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line pt-4 text-xs text-muted">
            <span>ETHGlobal Tokyo 2026 · Sepolia testnet · mock assets</span>
            <span className="text-line">·</span>
            <span>Every value on this page is read from chain; nothing is hard-coded.</span>
            <span className="text-line">·</span>
            <Link href="/system" className="underline underline-offset-4 hover:text-ink">
              System check
            </Link>
          </footer>
        </div>
      </body>
    </html>
  );
}
