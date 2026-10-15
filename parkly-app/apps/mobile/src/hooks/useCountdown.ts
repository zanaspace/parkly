import { useCallback, useEffect, useState } from 'react';

/** Seconds remaining until a deadline, ticking once a second. */
export function useCountdown() {
  const [until, setUntil] = useState<number | null>(null);
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    if (until === null) return;
    const tick = () => {
      const left = Math.max(0, Math.ceil((until - Date.now()) / 1000));
      setRemaining(left);
      if (left === 0) setUntil(null);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [until]);

  const start = useCallback((seconds: number) => setUntil(Date.now() + seconds * 1000), []);
  return { remaining, running: remaining > 0, start };
}
