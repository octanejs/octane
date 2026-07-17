// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/interactions/createEventHandler.ts).
// octane adaptations:
// - Handlers receive NATIVE events. Upstream builds the wrapped event by SPREADING a React
//   synthetic event (`{...e, overrides}`); spreading a native event copies nothing (its
//   properties are non-enumerable prototype accessors), so the wrapped event is a Proxy over
//   the live native event instead: the override methods win, function-valued properties are
//   bound to the underlying event, everything else forwards.
// - `BaseEvent` from '@react-types/shared' is typed over React's SyntheticEvent; a local
//   structural alias over the native Event type replaces it.
// - The dev-only console.error inside `stopPropagation` is not ported (the flag mechanics
//   are preserved exactly).

// Event bubbling can be problematic in real-world applications, so the default for React Spectrum components
// is not to propagate. This can be overridden by calling continuePropagation() on the event.
export type BaseEvent<T extends Event> = T & {
	/**
	 * Use continuePropagation.
	 *
	 * @deprecated
	 */
	stopPropagation(): void;
	continuePropagation(): void;
};

const hasOwn = Object.prototype.hasOwnProperty;

/**
 * This function wraps an event handler to make stopPropagation the default, and support
 * continuePropagation instead.
 */
export function createEventHandler<T extends Event>(
	handler?: (e: BaseEvent<T>) => void,
): ((e: T) => void) | undefined {
	if (!handler) {
		return undefined;
	}

	// NB: the flag deliberately lives on the WRAPPER closure, not per dispatch — after a
	// handler calls continuePropagation(), a later event on the same wrapper instance does
	// not re-arm stop-by-default. That is upstream's exact (and admittedly surprising)
	// contract at the pinned version; the differential KeyLatch fixture pins octane to
	// React's observable behavior across consecutive dispatches, so an upstream semantics
	// change will surface at the next pin bump rather than silently diverging here.
	let shouldStopPropagation = true;
	return (e: T) => {
		const overrides: Record<PropertyKey, any> = {
			preventDefault() {
				e.preventDefault();
			},
			isDefaultPrevented() {
				// On a native event, `defaultPrevented` is the source of truth (upstream reads
				// the synthetic event's isDefaultPrevented()).
				return e.defaultPrevented;
			},
			stopPropagation() {
				if (shouldStopPropagation) {
					// Upstream logs a dev-only console.error here ("stopPropagation is now the
					// default behavior..."); the flag is intentionally left as-is.
				} else {
					shouldStopPropagation = true;
				}
			},
			continuePropagation() {
				shouldStopPropagation = false;
				// nested createEventHandler might have set continue propagation so we should continue
				// propagation on wrappers
				if (typeof (e as any).continuePropagation === 'function') {
					(e as any).continuePropagation();
				}
			},
			isPropagationStopped() {
				return shouldStopPropagation;
			},
		};

		const event = new Proxy(e, {
			get(target, prop) {
				if (hasOwn.call(overrides, prop)) {
					return overrides[prop as any];
				}
				const value = Reflect.get(target, prop);
				// Native event members are prototype accessors/methods; bind functions to the
				// underlying event so invocation through the Proxy works.
				return typeof value === 'function' ? value.bind(target) : value;
			},
		}) as BaseEvent<T>;

		handler(event);

		if (shouldStopPropagation) {
			e.stopPropagation();
		}
	};
}
