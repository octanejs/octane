import {
	createBrowserHistory as createTanStackBrowserHistory,
	createHashHistory as createTanStackHashHistory,
} from '@tanstack/history';
import { prepareInitialHistoryState } from './historyState';

export { createHistory, createMemoryHistory } from '@tanstack/history';
export type * from '@tanstack/history';

export const createBrowserHistory: typeof createTanStackBrowserHistory = (options) => {
	prepareInitialHistoryState(options?.window);
	return createTanStackBrowserHistory(options);
};

export const createHashHistory: typeof createTanStackHashHistory = (options) => {
	prepareInitialHistoryState(options?.window);
	return createTanStackHashHistory(options);
};
