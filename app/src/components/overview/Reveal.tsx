'use client';

import {useEffect, useRef, useState} from 'react';

/**
 * Reveals its children once they scroll into view.
 *
 * Built on IntersectionObserver rather than an animation library: the page needs one effect, and
 * a dependency for one effect is a dependency to maintain. Anything that has already been seen
 * stays visible, so scrolling back up does not replay the page at you.
 *
 * Honours `prefers-reduced-motion`: the content still appears, it just arrives instead of moving.
 */
export function Reveal({
  children,
  delay = 0,
  className = '',
}: {
  children: React.ReactNode;
  /** Milliseconds, for staggering siblings. */
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setShown(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          observer.disconnect();
        }
      },
      {rootMargin: '0px 0px -12% 0px', threshold: 0.05},
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: shown ? 1 : 0,
        transform: shown ? 'none' : 'translateY(18px)',
        transition: `opacity 700ms cubic-bezier(0.16, 1, 0.3, 1) ${delay}ms, transform 700ms cubic-bezier(0.16, 1, 0.3, 1) ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}
