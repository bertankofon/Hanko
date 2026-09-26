'use client';

import {useEffect, useState} from 'react';

/**
 * Live countdown to an expiry, in unix seconds.
 *
 * The countdown is the point of the Identity tab: a permission that ends by itself is the thing a
 * mapping cannot give you, and watching it tick is more convincing than a timestamp. Enforcement
 * does not depend on this — the chain reads the same expiry — so if it drifts by a second, nothing
 * breaks.
 */
export function Countdown({expiry}: {expiry: number}) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, []);

  if (expiry === 0) return <span className="text-muted">—</span>;

  // A name registered "forever" carries a max-uint64 expiry; showing that as a countdown is noise.
  if (expiry > now + 60 * 60 * 24 * 365 * 5) return <span className="text-muted">no expiry</span>;

  const left = expiry - now;
  if (left <= 0) return <span className="text-fail">lapsed</span>;

  const hours = Math.floor(left / 3600);
  const minutes = Math.floor((left % 3600) / 60);
  const seconds = left % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');

  return (
    <span className={left < 300 ? 'text-unknown' : 'text-ink'}>
      {hours > 0 && `${hours}:`}
      {pad(minutes)}:{pad(seconds)}
    </span>
  );
}
