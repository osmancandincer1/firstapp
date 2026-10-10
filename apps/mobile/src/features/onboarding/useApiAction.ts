import { useCallback, useRef, useState } from 'react';

import type { ApiResult, ClientErrorCode } from '@/lib/api';

export interface ActionState {
  pending: boolean;
  error: ClientErrorCode | null;
  retryAt: string | null;
}

/**
 * Runs one server action at a time and keeps its pending/error state for the
 * screen. Double taps are ignored while a request is in flight.
 */
export function useApiAction<I, T>(
  call: (input: I) => Promise<ApiResult<T>>,
  onSuccess: (data: T) => void | Promise<void>,
) {
  const [state, setState] = useState<ActionState>({ pending: false, error: null, retryAt: null });
  const inFlight = useRef(false);

  const run = useCallback(
    async (input: I) => {
      if (inFlight.current) return;
      inFlight.current = true;
      setState({ pending: true, error: null, retryAt: null });
      const result = await call(input);
      inFlight.current = false;
      if (result.ok) {
        setState({ pending: false, error: null, retryAt: null });
        await onSuccess(result.data);
      } else {
        setState({ pending: false, error: result.error, retryAt: result.retryAt ?? null });
      }
    },
    [call, onSuccess],
  );

  const clearError = useCallback(() => setState((s) => ({ ...s, error: null, retryAt: null })), []);
  return { ...state, run, clearError };
}
