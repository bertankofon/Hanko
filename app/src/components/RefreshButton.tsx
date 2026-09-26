'use client';

import {useRouter} from 'next/navigation';
import {useTransition} from 'react';

export function RefreshButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => router.refresh())}
      className="rounded-lg border border-line px-2.5 py-1 text-xs hover:bg-panel-2 disabled:opacity-50"
    >
      {pending ? 'Reading…' : 'Refresh'}
    </button>
  );
}
