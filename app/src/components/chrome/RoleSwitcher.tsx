'use client';

import {useRouter} from 'next/navigation';
import {useEffect, useRef, useState, useTransition} from 'react';
import {setRole} from '@/app/role-action';

export interface RoleOption {
  id: string;
  label: string;
  blurb: string;
  address: string | null;
  /** What this wallet holds right now, read from chain — not part of its name. */
  seal: string;
  cleared: boolean;
}

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

/**
 * The one control that changes the whole app.
 *
 * Everything Hanko does answers a single question — may this address trade? — so the clearest way
 * to show it is to let the visitor be a different address and watch the same screens answer
 * differently. It sits in the header, not inside a panel, because it is not a form field.
 */
export function RoleSwitcher({options, current}: {options: RoleOption[]; current: string}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);

  const active = options.find((o) => o.id === current) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
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
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-3 rounded-xl border border-line bg-panel px-4 py-2.5 text-left transition-colors hover:border-seal/60"
        style={{opacity: pending ? 0.6 : 1}}
      >
        <span className="text-xs uppercase tracking-[0.14em] text-muted">Viewing as</span>
        <span className="text-base font-medium">{active.label}</span>
        <Seal option={active} />
        <span className="text-muted">▾</span>
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-2 w-[22rem] overflow-hidden rounded-xl border border-line bg-panel shadow-xl">
          {options.map((option) => {
            const isActive = option.id === current;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => choose(option.id)}
                className="block w-full border-b border-line px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-panel-2"
              >
                <span className="flex flex-wrap items-center gap-2">
                  <span className={isActive ? 'font-semibold text-seal' : 'font-medium'}>
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
      )}
    </div>
  );
}
