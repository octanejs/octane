// ClientOnly / useHydrated — port of react-router's ClientOnly.tsx. Renders
// children only once the client has hydrated: `useHydrated` reads a constant
// external store whose server snapshot is `false` and client snapshot is `true`,
// so SSR (and the hydration render) yield the fallback and the first client-only
// render onward yields the children.
import { useSyncExternalStore, createElement, Fragment } from 'octane';
import { splitSlot, subSlot } from './internal';

const subscribe = () => () => {};

export function useHydrated(...args: any[]): boolean {
	const [, slot] = splitSlot(args);
	return useSyncExternalStore(
		subscribe,
		() => true,
		() => false,
		subSlot(slot, 'hydrated'),
	);
}

export function ClientOnly(...args: any[]): any {
	const [user, slot] = splitSlot(args);
	const props = user[0] ?? {};
	return createElement(
		Fragment,
		null,
		useHydrated(subSlot(slot, 'co')) ? props.children : (props.fallback ?? null),
	);
}
