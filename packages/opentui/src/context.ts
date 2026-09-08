import type { CliRenderer, KeyHandler } from '@opentui/core';
import { createContext, useContext } from 'octane/universal';

export interface AppContextValue {
	keyHandler: KeyHandler | null;
	renderer: CliRenderer | null;
}

export const AppContext = createContext<AppContextValue>({
	keyHandler: null,
	renderer: null,
});

export function useAppContext(): AppContextValue {
	return useContext(AppContext);
}
