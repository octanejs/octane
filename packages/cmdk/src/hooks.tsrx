// Custom hooks shared across the cmdk components. Kept in a `.tsrx` module so
// octane's compiler owns their hook slots (the same pattern sonner uses for its
// hooks.tsrx); consumers import and call them like any hook.
import {
	useId as octaneUseId,
	useLayoutEffect,
	useRef,
	useState,
	useSyncExternalStore,
} from 'octane';
import { useCommand, useStore } from './context.tsrx';
import { VALUE_ATTR } from './lib/constants';
import type { State } from './types';

/**
 * cmdk takes its ids from `@radix-ui/react-id`, which prefixes the framework's
 * `useId` with `radix-` so they read as Radix-owned and never collide with app
 * ids. Match that here (rather than octane's bare `useId`) so the rendered
 * `id`/`aria-*`/`for` wiring is shape-compatible with upstream — the
 * differential suite compares it.
 */
export function useId(): string {
	return `radix-${octaneUseId()}`;
}

/** A ref that always holds the latest value (updated in a layout effect). */
export function useAsRef<T>(data: T) {
	const ref = useRef<T>(data);
	useLayoutEffect(() => {
		ref.current = data;
	});
	return ref;
}

/** A ref whose value is computed lazily on first render. */
export function useLazyRef<T>(fn: () => T) {
	const ref = useRef<T | undefined>(undefined);
	if (ref.current === undefined) {
		ref.current = fn();
	}
	return ref as { current: T };
}

/** Run a selector against the store state. */
export function useCmdk<T>(selector: (state: State) => T): T {
	const store = useStore()!;
	const cb = () => selector(store.snapshot());
	return useSyncExternalStore(store.subscribe, cb, cb);
}

/**
 * Registers an item/group's value: from the provided `value` prop or the
 * rendered element's `textContent` (cmdk's string-child inspection is dropped
 * because octane's compiled children are opaque). Returns the value ref.
 *
 * NOTE on `aliases`: octane compiles a custom-hook call as
 * `withSlot(sym, hook, ...args, sym)`, so the trailing slot symbol becomes an
 * extra argument. A caller that OMITS this optional trailing parameter receives
 * that symbol instead of the `= []` default (which only fires on `undefined`).
 * Callers must therefore pass `aliases` explicitly, and the read below is
 * defensive so a missed call site degrades to "no keywords" rather than
 * throwing mid-effect (which silently aborts value registration).
 */
export function useValue(
	id: string,
	ref: { current: HTMLElement | null },
	deps: (string | undefined | { current: HTMLElement | null })[],
	aliases: string[] = [],
) {
	const valueRef = useRef<string | undefined>(undefined);
	const context = useCommand()!;

	useLayoutEffect(() => {
		const value = (() => {
			for (const part of deps) {
				if (typeof part === 'string') return part.trim();
				if (part && typeof part === 'object' && 'current' in part) {
					if (part.current) return part.current.textContent?.trim();
					return valueRef.current;
				}
			}
			return undefined;
		})();

		const keywords =
			Array.isArray(aliases) ? aliases.map((alias) => alias.trim()) : [];
		context.value(id, value, keywords);
		ref.current?.setAttribute(VALUE_ATTR, value ?? '');
		valueRef.current = value;
	});

	return valueRef;
}

/** Imperatively run a function on the next layout-effect cycle. */
export function useScheduleLayoutEffect() {
	const [s, ss] = useState<object | undefined>(undefined);
	const fns = useLazyRef(() => new Map<string | number, () => void>());

	useLayoutEffect(() => {
		// Snapshot and clear BEFORE running: a scheduled callback may schedule more
		// work (e.g. selectFirstItem → setState('value') → schedule(...)), and those
		// nested entries must survive into the next flush rather than be wiped by a
		// reset that runs after the callbacks. Each callback is isolated so one
		// throwing (e.g. scrollIntoView) can't drop the callbacks queued after it.
		const pending = [...fns.current.values()];
		fns.current = new Map();
		for (const f of pending) {
			try {
				f();
			} catch (error) {
				// Isolate, but never swallow. A scheduled callback can run user code
				// (selectFirstItem -> setState('value') -> onValueChange), so a failure
				// here must stay visible; report it the same way octane reports an
				// exception raised inside an effect, and keep the siblings running.
				console.error(error);
			}
		}
	}, [s]);

	return (id: string | number, cb: () => void) => {
		fns.current.set(id, cb);
		ss({});
	};
}
