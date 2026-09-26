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
    /* No horizontal padding on the links: the first tab lines up with the mark in the header
       above it, so the spacing lives in the gap instead. */
    <nav className="flex flex-wrap gap-x-8 gap-y-1 border-b border-line">
      {tabs.map((tab) => {
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
