// The three cmdk contexts and their accessors. `useContext` is context-identity
// keyed (not compiler-slot keyed), so these thin wrappers are safe to share.
import { createContext, useContext } from 'octane';
import type { Context, Group, Store } from './types';

export const CommandContext = createContext<Context | null>(null);
export const useCommand = () => useContext(CommandContext);

export const StoreContext = createContext<Store | null>(null);
export const useStore = () => useContext(StoreContext);

export const GroupContext = createContext<Group | null>(null);
