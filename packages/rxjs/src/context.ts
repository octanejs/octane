import { createContext, useContext } from 'octane';
import type { StateObservable } from '@rx-state/core';

export type SubscribeState = (source: StateObservable<unknown>) => void;
export const SubscriptionContext = createContext<SubscribeState | null>(null);
export const useSubscription = () => useContext(SubscriptionContext);
