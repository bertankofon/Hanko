'use client';

import Link from 'next/link';
import {usePathname} from 'next/navigation';

/** One tab per phase. Tabs land as their phase does; the rest say so plainly. */
export const TABS = [
  {href: '/overview', label: 'Overview', phase: 7},
  {href: '/system', label: 'System', phase: 0},
  {href: '/pool', label: 'Pool', phase: 1},
  {href: '/identity', label: 'Identity', phase: 3},
  {href: '/issuer', label: 'Venue operator', phase: 5},
  {href: '/audit', label: 'Audit', phase: 5},
  {href: '/demo', label: 'Demo', phase: 7},
] as const;

export function TabNav() {
  const pathname = usePathname();

  return (
    /* No horizontal padding on the links: the first tab has to line up with the mark
       in the header above it, so the spacing lives in the gap instead. */
    <nav className="flex flex-wrap gap-x-8 gap-y-1 border-b border-line">
      {TABS.map((tab) => {
        const active = pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={[
              'relative py-4 text-base font-medium tracking-tight transition-colors',
              active ? 'text-ink' : 'text-muted hover:text-ink',
            ].join(' ')}
          >
            {tab.label}
            {active && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-seal" />}
          </Link>
        );
      })}
    </nav>
  );
}
