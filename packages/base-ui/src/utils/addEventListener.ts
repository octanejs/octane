// Ported from .base-ui/packages/utils/src/addEventListener.ts. Adds a listener, returns a
// cleanup that removes it.
export function addEventListener(
	target: { addEventListener: any; removeEventListener: any },
	type: string,
	listener: EventListenerOrEventListenerObject,
	options?: boolean | AddEventListenerOptions,
): () => void {
	target.addEventListener(type, listener, options);
	return () => {
		target.removeEventListener(type, listener, options);
	};
}
