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
    /* Lives inside the header bar. `flex-1 min-w-0` lets the nav absorb whatever width is left
       after the wordmark and the role switcher take theirs, and shrink below its content width
       so its own `flex-wrap` can pull tabs onto a second line before pushing the switcher out
       of the top row. `items-stretch` pulls each link to the nav's full height, so `-bottom-px`
       on the active indicator lands on the header's own bottom border — one line, not two. */
    <nav className="flex min-w-0 flex-1 flex-wrap items-stretch justify-center gap-x-5 xl:gap-x-3">
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
