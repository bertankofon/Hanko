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
          {/* Single-row header. Identity on the left, section tabs in the middle, viewer on the
              right. The wordmark and the role switcher hold their natural width (`shrink-0`) and
              never wrap; only the tabs (nav has `flex-1 min-w-0` inside `TabNav`) shrink, so if
              they still don't fit — the operator has six of them — they wrap onto a second line
              within their own column before pushing the switcher out of the top row. `items-
              stretch` pulls each tab to the bar's full height, so the active-tab underline sits
              on the header's own bottom border rather than under a second one. */}
          <header className="flex items-stretch gap-x-4 border-b border-line">
            <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 py-3">
              <Link href="/overview" className="flex items-center">
                {/* The lockup carries the wordmark's own red, which reads on this background at
                    this size. Alt describes the mark since it is the name itself. */}
                {/* eslint-disable-next-line @next/next/no-img-element -- fixed-size brand asset */}
                <img src="/brand/hanko-lockup-trimmed.webp" alt="Hanko" className="h-10 w-auto" />
              </Link>
              {/* Full text ink so it reads as a page subtitle next to the wordmark rather than
                  a caption. Shown from xl up: at narrower widths the tabs and the role switcher
                  want the width more than the tagline does, and the tagline is redundant with
                  the wordmark that's already showing. */}
              <span className="hidden items-center text-sm text-ink xl:inline-flex">
                <span className="mr-3 text-line">/</span>
                Tokenized stocks, permissioned by ENS
              </span>
            </div>

            <TabNav tabs={tabsFor(viewer.id)} />

            <div className="flex shrink-0 items-center py-2">
              <RoleSwitcher options={options} current={viewer.id} />
            </div>
          </header>

          <main className="py-6">{children}</main>

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
