'use client';

import Link from 'next/link';
import {usePathname} from 'next/navigation';

export interface Tab {
  href: string;
  label: string;
}

export function TabNav({tabs}: {tabs: Tab[]}) {
  const pathname = usePathname();

  return (
    /* Lives inside the header bar. items-stretch on both the header and this nav pulls each
       link to the header's full height, so `-bottom-px` on the active indicator lands exactly
       on the header's own bottom border — one line, not two. */
    <nav className="flex flex-wrap items-stretch gap-x-6">
      {tabs.map((tab) => {
        const active = pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={[
              'relative flex items-center py-3 text-base font-medium tracking-tight transition-colors',
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
