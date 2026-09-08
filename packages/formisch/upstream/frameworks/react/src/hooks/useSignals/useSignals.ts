import { type Listener, setListener } from '@formisch/core/react';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
} from 'react';

/**
 * Hook to enable reactive signals within a React component.
 */
export function useSignals(): void {
  // Create a force update function to trigger re-renders
  const [, forceUpdate] = useReducer((x) => x + 1, 0);

  // Create listener tuple for current component
  const listener = useMemo<Listener>(() => [forceUpdate, new Set()], []);

  // Create cleanup function to remove listener from subscribers
  const cleanSubscribers = useCallback(() => {
    for (const subscriber of listener[1]) {
      subscriber.delete(listener);
    }
  }, [listener]);

  // Clean previously registered subscribers
  cleanSubscribers();

  // Set listener for tracking signals
  setListener(listener);

  // Clear listener directly after render
  useLayoutEffect(() => setListener(undefined));

  // Cleanup registered subscribers on unmount
  const timeout = useRef<ReturnType<typeof setTimeout>>(null);
  useEffect(() => {
    // Hint: This timeout hack is necessary because React `<StrictMode>`
    // re-runs effects twice in dev mode.
    if (timeout.current) {
      clearTimeout(timeout.current);
      timeout.current = null;
    }
    return () => {
      timeout.current = setTimeout(cleanSubscribers);
    };
  }, [cleanSubscribers]);
}
