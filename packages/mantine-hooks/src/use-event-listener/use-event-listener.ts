import { useCallback, useEffect, useRef } from 'octane';

export function useEventListener<K extends keyof HTMLElementEventMap, T extends HTMLElement = any>(
	type: K,
	listener: (this: T, ev: HTMLElementEventMap[K]) => any,
	options?: boolean | AddEventListenerOptions,
): React.RefCallback<T | null> {
	const attachment = useRef<{
		node: T;
		type: K;
		listener: (this: T, ev: HTMLElementEventMap[K]) => any;
		options?: boolean | AddEventListenerOptions;
	} | null>(null);

	const detach = useCallback(() => {
		const current = attachment.current;
		if (current) {
			current.node.removeEventListener(current.type, current.listener as any, current.options);
			attachment.current = null;
		}
	}, []);

	const callbackRef: React.RefCallback<T | null> = useCallback(
		(node) => {
			detach();
			if (!node) {
				return undefined;
			}

			node.addEventListener(type, listener as any, options);
			const current = { node, type, listener, options };
			attachment.current = current;

			return () => {
				// A stale ref cleanup must not detach a replacement node.
				if (attachment.current === current) {
					detach();
				}
			};
		},
		[type, listener, options, detach],
	);

	useEffect(() => () => detach(), [detach]);

	return callbackRef;
}
