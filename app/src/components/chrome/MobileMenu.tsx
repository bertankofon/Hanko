'use client';

import Link from 'next/link';
import {usePathname, useRouter} from 'next/navigation';
import {useEffect, useRef, useState, useTransition} from 'react';
import {setRole} from '@/app/role-action';
import type {Tab} from '@/components/TabNav';
import type {RoleOption} from '@/components/chrome/RoleSwitcher';

/**
 * Mobile chrome. The desktop header (logo · tabs · role switcher, one row) does not survive a
 * phone: three flex children fighting for ~360px and none of them optional. Below `md` we hide
 * that row and show a hamburger; opening it slides a drawer in from the right with the same
 * three things stacked and given room to breathe.
 *
 * The current role is shown next to the hamburger even when the drawer is closed, because the
 * whole app answers a single question — "may this address trade?" — and forgetting who you are
 * looking at makes every screen misleading.
 */
export function MobileMenu({
  tabs,
  options,
  current,
}: {
  tabs: Tab[];
  options: RoleOption[];
  current: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const pathname = usePathname();
  const panelRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);

  const active = options.find((o) => o.id === current) ?? options[0];

  // Route change → close. Otherwise a tab click leaves the drawer open under the new page.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Lock body scroll while the drawer is open, and restore focus to the opener on close.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    // Focus the first focusable inside the panel for keyboard users.
    panelRef.current?.querySelector<HTMLElement>('a,button')?.focus();
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKey);
      openerRef.current?.focus();
    };
  }, [open]);

  function choose(id: string) {
    setOpen(false);
    startTransition(async () => {
      await setRole(id);
      router.refresh();
    });
  }

  return (
    <div className="flex items-center md:hidden">
      <button
        ref={openerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        aria-expanded={open}
        aria-controls="mobile-drawer"
        className="flex items-center gap-2 rounded-lg border border-line bg-panel px-3 py-2 text-sm transition-colors hover:border-seal/60"
        style={{opacity: pending ? 0.6 : 1}}
      >
        <span className="max-w-[8rem] truncate font-medium">{active.label}</span>
        <HamburgerIcon />
      </button>

      {/* Backdrop + panel. Both rendered together so the CSS transition on the panel has a stable
          parent; we key visibility off `open` via translate + opacity so the exit is animated. */}
      <div
        aria-hidden={!open}
        className={[
          'fixed inset-0 z-40 transition-opacity duration-200',
          open ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0',
        ].join(' ')}
      >
        <button
          type="button"
          aria-label="Close menu"
          onClick={() => setOpen(false)}
          className="absolute inset-0 h-full w-full bg-black/60"
        />
        <div
          id="mobile-drawer"
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
          className={[
            'absolute inset-y-0 right-0 flex h-full w-[88%] max-w-sm flex-col overflow-y-auto border-l border-line bg-bg shadow-2xl transition-transform duration-200',
            open ? 'translate-x-0' : 'translate-x-full',
          ].join(' ')}
        >
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <span className="text-xs uppercase tracking-[0.14em] text-muted">Menu</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close menu"
              className="rounded-md border border-line bg-panel px-2 py-1 text-sm text-muted transition-colors hover:border-seal/60 hover:text-ink"
            >
              ✕
            </button>
          </div>

          <div className="px-5 py-4">
            <div className="mb-2 text-xs uppercase tracking-[0.14em] text-muted">Sections</div>
            <nav className="flex flex-col">
              {tabs.map((tab) => {
                const isActive = pathname.startsWith(tab.href);
                return (
                  <Link
                    key={tab.href}
                    href={tab.href}
                    className={[
                      'flex items-center justify-between rounded-lg px-3 py-3 text-base transition-colors',
                      isActive
                        ? 'bg-panel font-semibold text-ink'
                        : 'text-muted hover:bg-panel hover:text-ink',
                    ].join(' ')}
                  >
                    <span>{tab.label}</span>
                    {isActive && <span className="text-xs text-seal">current</span>}
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="border-t border-line px-5 py-4">
            <div className="mb-2 text-xs uppercase tracking-[0.14em] text-muted">Viewing as</div>
            <div className="flex flex-col gap-1">
              {options.map((option) => {
                const isActive = option.id === current;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => choose(option.id)}
                    className={[
                      'rounded-lg border px-3 py-3 text-left transition-colors',
                      isActive
                        ? 'border-seal/50 bg-panel'
                        : 'border-line bg-panel/50 hover:border-seal/40 hover:bg-panel',
                    ].join(' ')}
                  >
                    <span className="flex flex-wrap items-center gap-2">
                      <span
                        className={isActive ? 'font-semibold text-seal' : 'font-medium text-ink'}
                      >
                        {option.label}
                      </span>
                      <Seal option={option} />
                      {isActive && <span className="text-xs text-seal">current</span>}
                    </span>
                    <span className="mt-0.5 block text-sm text-muted">{option.blurb}</span>
                    {option.address && (
                      <span className="mt-1 block font-mono text-xs text-muted">
                        {option.address.slice(0, 10)}…{option.address.slice(-6)}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-auto border-t border-line px-5 py-4">
            <Link
              href="/system"
              className="text-sm text-muted underline underline-offset-4 hover:text-ink"
            >
              System check
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

/** The same seal rendering RoleSwitcher uses; kept local so the two components stay independent. */
function Seal({option}: {option: RoleOption}) {
  if (option.id === 'operator') return null;
  return (
    <span
      className={[
        'rounded-full border px-2 py-0.5 text-xs font-medium',
        option.cleared ? 'border-pass/40 text-pass' : 'border-line text-muted',
      ].join(' ')}
    >
      {option.seal}
    </span>
  );
}

function HamburgerIcon() {
  return (
    <svg
      aria-hidden="true"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="4" y1="7" x2="20" y2="7" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="17" x2="20" y2="17" />
    </svg>
  );
}
