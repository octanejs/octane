import { useSyncExternalStore } from './react-deps';
import { optionAndSlot, splitSlot, subSlot } from './internal';
import type { Path, SearchString } from './location-hook';

const eventPopstate = 'popstate';
const eventPushState = 'pushState';
const eventReplaceState = 'replaceState';
const eventHashchange = 'hashchange';
const events = [eventPopstate, eventPushState, eventReplaceState, eventHashchange];

const subscribeToLocationUpdates = (callback: () => void) => {
	for (const event of events) {
		addEventListener(event, callback);
	}
	return () => {
		for (const event of events) {
			removeEventListener(event, callback);
		}
	};
};

type Primitive = string | number | bigint | boolean | null | undefined | symbol;

function useLocationPropertyInternal<S>(
	fn: () => S,
	ssrFn: (() => S) | undefined,
	slot: symbol | undefined,
): S {
	return useSyncExternalStore(
		subscribeToLocationUpdates,
		fn,
		ssrFn,
		subSlot(slot, 'location-property'),
	);
}

export function useLocationProperty<S extends Primitive>(fn: () => S, ssrFn?: () => S): S;
export function useLocationProperty<S extends Primitive>(
	fn: () => S,
	...rest: [ssrFn?: () => S, slot?: symbol]
): S {
	const [args, slot] = splitSlot(rest);
	return useLocationPropertyInternal(fn, args[0] as (() => S) | undefined, slot);
}

const currentSearch = () => location.search;

export type BrowserSearchHook = (options?: { ssrSearch?: SearchString }) => SearchString;

export function useSearch(options?: { ssrSearch?: SearchString }): SearchString;
export function useSearch(
	first: { ssrSearch?: SearchString } | symbol = {},
	second?: symbol,
): SearchString {
	const [{ ssrSearch }, slot] = optionAndSlot(first, second);
	return useLocationPropertyInternal(
		currentSearch,
		ssrSearch != null ? () => ssrSearch : currentSearch,
		subSlot(slot, 'search'),
	);
}

const currentPathname = () => location.pathname;

function usePathnameInternal({ ssrPath }: { ssrPath?: Path }, slot: symbol | undefined): Path {
	return useLocationPropertyInternal(
		currentPathname,
		ssrPath != null ? () => ssrPath : currentPathname,
		subSlot(slot, 'pathname'),
	);
}

export function usePathname(options?: { ssrPath?: Path }): Path;
export function usePathname(first: { ssrPath?: Path } | symbol = {}, second?: symbol): Path {
	const [options, slot] = optionAndSlot(first, second);
	return usePathnameInternal(options, slot);
}

const currentHistoryState = () => history.state as unknown;

export function useHistoryState<T = any>(): T;
export function useHistoryState<T = any>(...rest: [slot?: symbol]): T {
	const [, slot] = splitSlot(rest);
	return useLocationPropertyInternal(
		currentHistoryState as () => T,
		() => null as T,
		subSlot(slot, 'history-state'),
	);
}

export function navigate<S = any>(
	to: string | URL,
	options?: { replace?: boolean; state?: S; transition?: boolean },
): void;
export function navigate<S = any>(
	to: string | URL,
	{
		replace = false,
		state = null,
	}: { replace?: boolean; state?: S | null; transition?: boolean } = {},
): void {
	history[replace ? eventReplaceState : eventPushState](state, '', to);
}

export type BrowserLocationHook = (options?: { ssrPath?: Path }) => [Path, typeof navigate];

export function useBrowserLocation(options?: { ssrPath?: Path }): [Path, typeof navigate];
export function useBrowserLocation(
	first: { ssrPath?: Path } | symbol = {},
	second?: symbol,
): [Path, typeof navigate] {
	const [options, slot] = optionAndSlot(first, second);
	return [usePathnameInternal(options, subSlot(slot, 'browser-location')), navigate];
}

const patchKey = Symbol.for('wouter_v3');

if (
	typeof history !== 'undefined' &&
	typeof window !== 'undefined' &&
	typeof (window as unknown as Record<PropertyKey, unknown>)[patchKey] === 'undefined'
) {
	for (const type of [eventPushState, eventReplaceState] as const) {
		const original = history[type];
		history[type] = function (...args: Parameters<History[typeof type]>) {
			const result = original.apply(this, args);
			const event = new Event(type) as Event & { arguments?: unknown[] };
			event.arguments = args;

			dispatchEvent(event);
			return result;
		};
	}

	Object.defineProperty(window, patchKey, { value: true });
}
