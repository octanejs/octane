// Adapted from recharts@3.9.2, commit b3451050c027a23957ffa50a2665c9119df21e47.
import type { NativeEvent } from './OctaneTypes';

export function createEventProxy<T extends NativeEvent>(reactEvent: T): T {
	// Native events are not pooled. Capture the delegated target before a
	// throttled callback runs, after dispatch has cleared currentTarget.
	const { currentTarget } = reactEvent;
	return new Proxy(reactEvent, {
		get: (target, prop) => {
			if (prop === 'currentTarget') {
				return currentTarget;
			}
			const value = Reflect.get(target, prop);
			if (typeof value === 'function') {
				return value.bind(target);
			}
			return value;
		},
	});
}
