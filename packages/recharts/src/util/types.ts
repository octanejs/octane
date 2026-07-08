// Port of the runtime helpers from recharts' util/types.ts (the file is mostly
// type definitions; these are the two runtime exports the components use).
// octane events are NATIVE delegated DOM events — handlers receive the real
// event, matching the platform (never a synthetic wrapper).
import { isValidElement } from 'octane';
import { isEventKey } from '../util/excludeEventProps';

// Collect the event handlers off a props bag (or element), rebinding each to
// `(e) => handler(props, e)` — recharts item components pass their own props as
// the first argument of chart-level handlers.
export function adaptEventHandlers(
	props: unknown,
	newHandler?: (e: Event) => void,
): Record<string, (e: Event) => void> | null {
	if (!props || typeof props === 'function' || typeof props === 'boolean') {
		return null;
	}
	let inputProps: any = props;
	if (isValidElement(props)) {
		inputProps = (props as any).props;
	}
	if (typeof inputProps !== 'object' && typeof inputProps !== 'function') {
		return null;
	}
	const out: Record<string, (e: Event) => void> = {};
	Object.keys(inputProps).forEach((key) => {
		if (isEventKey(key) && typeof inputProps[key] === 'function') {
			out[key] = newHandler || ((e: Event) => inputProps[key](inputProps, e));
		}
	});
	return out;
}

const getEventHandlerOfChild =
	(originalHandler: (data: any, index: number, e: Event) => void, data: any, index: number) =>
	(e: Event): null => {
		originalHandler(data, index, e);
		return null;
	};

// Rebind the event handlers off a child's props to `(e) => handler(data, index, e)`.
export function adaptEventsOfChild(
	props: Record<string, any>,
	data: any,
	index: number,
): Record<string, (e: Event) => void> | null {
	if (props === null || typeof props !== 'object') {
		return null;
	}
	let out: Record<string, (e: Event) => void> | null = null;
	Object.keys(props).forEach((key) => {
		const item = props[key];
		if (isEventKey(key) && typeof item === 'function') {
			if (!out) out = {};
			out[key] = getEventHandlerOfChild(item, data, index);
		}
	});
	return out;
}
