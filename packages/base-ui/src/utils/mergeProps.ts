// Ported from .base-ui/packages/react/src/merge-props/mergeProps.ts (v1.6.0).
//
// Merges sets of props left-to-right, Object.assign-style (rightmost wins) EXCEPT:
//   - event handlers (`onXxx`) CHAIN — the external (rightmost) handler runs first,
//     then ours, unless the external handler called `event.preventBaseUIHandler()`;
//   - `className` strings concatenate (external first);
//   - `style` objects merge (external keys win).
// A prop entry may be a getter function `(mergedSoFar) => props`; then it is
// responsible for its own chaining. `ref` is never merged here.
//
// octane adaptation: React makes an event preventable only when it is a SYNTHETIC event
// (`nativeEvent in event`). octane dispatches NATIVE DOM events, so we attach the
// `preventBaseUIHandler` shim to ANY event object — the analogue of the radix port using
// `event.cancelBubble` — so a Base UI part's `preventBaseUIHandler()` coordination works.
import { mergeObjects } from './mergeObjects';

const EMPTY_PROPS = {};

type AnyProps = Record<string, any>;
type InputProps = AnyProps | ((otherProps: AnyProps) => AnyProps) | undefined;

export function mergeProps(a: InputProps, b: InputProps): AnyProps;
export function mergeProps(a: InputProps, b: InputProps, c: InputProps): AnyProps;
export function mergeProps(a: InputProps, b: InputProps, c: InputProps, d: InputProps): AnyProps;
export function mergeProps(
	a: InputProps,
	b: InputProps,
	c: InputProps,
	d: InputProps,
	e: InputProps,
): AnyProps;
export function mergeProps(a: any, b: any, c?: any, d?: any, e?: any): AnyProps {
	if (!c && !d && !e && !a) {
		return createInitialMergedProps(b);
	}
	let merged = createInitialMergedProps(a);
	if (b) {
		merged = mergeInto(merged, b);
	}
	if (c) {
		merged = mergeInto(merged, c);
	}
	if (d) {
		merged = mergeInto(merged, d);
	}
	if (e) {
		merged = mergeInto(merged, e);
	}
	return merged;
}

export function mergePropsN(props: InputProps[]): AnyProps {
	if (props.length === 0) {
		return EMPTY_PROPS as AnyProps;
	}
	if (props.length === 1) {
		return createInitialMergedProps(props[0]) as AnyProps;
	}
	let merged = createInitialMergedProps(props[0]);
	for (let i = 1; i < props.length; i += 1) {
		merged = mergeInto(merged, props[i]);
	}
	return merged;
}

function createInitialMergedProps(inputProps: InputProps): AnyProps {
	if (isPropsGetter(inputProps)) {
		return { ...resolvePropsGetter(inputProps, EMPTY_PROPS) };
	}
	return copyInitialProps(inputProps);
}

function mergeInto(merged: AnyProps, inputProps: InputProps): AnyProps {
	if (isPropsGetter(inputProps)) {
		return resolvePropsGetter(inputProps, merged);
	}
	return mutablyMergeInto(merged, inputProps);
}

function copyInitialProps(inputProps: AnyProps | undefined): AnyProps {
	const copiedProps: AnyProps = { ...inputProps };
	for (const propName in copiedProps) {
		const propValue = copiedProps[propName];
		if (isEventHandler(propName, propValue)) {
			copiedProps[propName] = wrapEventHandler(propValue);
		}
	}
	return copiedProps;
}

function mutablyMergeInto(mergedProps: AnyProps, externalProps: AnyProps | undefined): AnyProps {
	if (!externalProps) {
		return mergedProps;
	}
	for (const propName in externalProps) {
		const externalPropValue = externalProps[propName];
		switch (propName) {
			case 'style': {
				mergedProps[propName] = mergeObjects(mergedProps.style, externalPropValue);
				break;
			}
			case 'className': {
				mergedProps[propName] = mergeClassNames(mergedProps.className, externalPropValue);
				break;
			}
			default: {
				if (isEventHandler(propName, externalPropValue)) {
					mergedProps[propName] = mergeEventHandlers(mergedProps[propName], externalPropValue);
				} else {
					mergedProps[propName] = externalPropValue;
				}
			}
		}
	}
	return mergedProps;
}

function isEventHandler(key: string, value: unknown): boolean {
	// `onX` where X is uppercase; value is a function or undefined. Char-code check
	// (matches Base UI — faster than a regex).
	const code0 = key.charCodeAt(0);
	const code1 = key.charCodeAt(1);
	const code2 = key.charCodeAt(2);
	return (
		code0 === 111 /* o */ &&
		code1 === 110 /* n */ &&
		code2 >= 65 /* A */ &&
		code2 <= 90 /* Z */ &&
		(typeof value === 'function' || typeof value === 'undefined')
	);
}

function isPropsGetter(inputProps: InputProps): inputProps is (props: AnyProps) => AnyProps {
	return typeof inputProps === 'function';
}

function resolvePropsGetter(inputProps: InputProps, previousProps: AnyProps): AnyProps {
	if (isPropsGetter(inputProps)) {
		return inputProps(previousProps);
	}
	return inputProps ?? (EMPTY_PROPS as AnyProps);
}

// octane: any event object is preventable (octane events are native, never synthetic).
function isPreventableEvent(event: unknown): event is object {
	return event != null && typeof event === 'object';
}

function mergeEventHandlers(
	ourHandler: Function | undefined,
	theirHandler: Function | undefined,
): Function | undefined {
	if (!theirHandler) {
		return ourHandler;
	}
	if (!ourHandler) {
		return wrapEventHandler(theirHandler);
	}
	return (...args: unknown[]) => {
		const event = args[0];
		if (isPreventableEvent(event)) {
			makeEventPreventable(event);
			const result = theirHandler(...args);
			if (!(event as any).baseUIHandlerPrevented) {
				ourHandler(...args);
			}
			return result;
		}
		const result = theirHandler(...args);
		ourHandler(...args);
		return result;
	};
}

function wrapEventHandler(handler: Function | undefined): Function | undefined {
	if (!handler) {
		return handler;
	}
	return (...args: unknown[]) => {
		const event = args[0];
		if (isPreventableEvent(event)) {
			makeEventPreventable(event);
		}
		return handler(...args);
	};
}

export function makeEventPreventable<T extends object>(event: T): T {
	(event as any).preventBaseUIHandler = () => {
		(event as any).baseUIHandlerPrevented = true;
	};
	return event;
}

export function mergeClassNames(
	ourClassName: string | undefined,
	theirClassName: string | undefined,
): string | undefined {
	if (theirClassName) {
		if (ourClassName) {
			return theirClassName + ' ' + ourClassName;
		}
		return theirClassName;
	}
	return ourClassName;
}
