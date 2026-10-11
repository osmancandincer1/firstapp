import { useEffect } from 'react';
import { AppState } from 'react-native';

import { touchActivity } from './api';

/**
 * Marks the user active when the app opens or returns to the foreground
 * (§5 "active in the last 7 days"). The server writes at most every 5 minutes.
 */
export function useForegroundActivity() {
  useEffect(() => {
    void touchActivity();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void touchActivity();
    });
    return () => sub.remove();
  }, []);
}
