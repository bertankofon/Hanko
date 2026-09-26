'use client';

import {useEffect, useRef, useState} from 'react';

/**
 * A looping step counter that only runs while its element is on screen.
 *
 * Both explainer diagrams are state machines on a timer, and a loop ticking in a background tab
 * is wasted work. Under `prefers-reduced-motion` it parks on `restStep` instead of cycling, so the
 * diagram still shows a meaningful frame rather than an empty one.
 */
export function useStepLoop(durations: number[], restStep = 0) {
  const ref = useRef<HTMLDivElement>(null);
  const [tick, setTick] = useState(0);
  const [running, setRunning] = useState(false);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setReduced(true);
      setTick(restStep);
      return;
    }

    const observer = new IntersectionObserver(([entry]) => setRunning(entry.isIntersecting), {
      threshold: 0.25,
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [restStep]);

  useEffect(() => {
    if (!running || reduced) return;
    let current = 0;
    let timer: ReturnType<typeof setTimeout>;

    const advance = () => {
      setTick(current);
      timer = setTimeout(() => {
        current += 1;
        advance();
      }, durations[current % durations.length]);
    };

    advance();
    return () => clearTimeout(timer);
    // `durations` is a literal at every call site; re-running on identity changes would restart
    // the loop on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, reduced]);

  return {ref, tick, frozen: reduced};
}
