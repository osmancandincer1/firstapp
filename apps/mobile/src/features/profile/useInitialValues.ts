import { useEffect, useRef } from 'react';

/**
 * Copies server values into form state once, when they first arrive. Later
 * refetches (after saving, focus, invalidation) never overwrite what the
 * user is typing.
 */
export function useInitialValues<T>(data: T | null | undefined, apply: (data: T) => void) {
  const done = useRef(false);
  useEffect(() => {
    if (done.current || data === undefined || data === null) return;
    done.current = true;
    apply(data);
    // `apply` is intentionally read once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);
}
