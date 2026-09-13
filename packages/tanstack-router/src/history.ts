// `@tanstack/history` is a separate framework-agnostic dependency (the browser/
// hash/memory history abstractions). react-router re-exports it from `./history`;
// we mirror that so `@octanejs/tanstack-router/history` and the bare entry both resolve it.
export {
	createHistory,
	createBrowserHistory,
	createHashHistory,
	createMemoryHistory,
} from '@tanstack/history';
export type * from '@tanstack/history';

// Route masking and hash restoration extend the neutral history state.
import type { HistoryLocation } from '@tanstack/history';
declare module '@tanstack/history' {
	interface HistoryState {
		__tempLocation?: HistoryLocation;
		__tempKey?: string;
		__hashScrollIntoViewOptions?: boolean | ScrollIntoViewOptions;
	}
}
