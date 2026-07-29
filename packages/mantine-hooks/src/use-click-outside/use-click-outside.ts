import { useEffect, useEffectEvent, useRef } from 'octane';

type EventType = MouseEvent | TouchEvent;

const DEFAULT_EVENTS = ['mousedown', 'touchstart'];

function withoutSlot<T>(value: T | symbol): T | undefined {
	return typeof value === 'symbol' ? undefined : value;
}

export function useClickOutside<T extends HTMLElement = any>(
	callback: (event: EventType) => void,
	events?: string[] | null,
	nodes?: (HTMLElement | null)[],
	enabled: boolean = true,
) {
	const ref = useRef<T | null>(null);
	const eventsList = withoutSlot(events) || DEFAULT_EVENTS;
	const nodesList = withoutSlot(nodes);
	const isEnabled = withoutSlot(enabled) ?? true;

	const listener = useEffectEvent((event: Event) => {
		const { target } = event ?? {};
		const shouldIgnore =
			!document.body.contains(target as Node) && (target as Element)?.tagName !== 'HTML';

		if (shouldIgnore) {
			return;
		}

		const path = event.composedPath();

		if (Array.isArray(nodesList)) {
			const shouldTrigger = nodesList.every((node) => !!node && !path.includes(node));
			shouldTrigger && callback(event as EventType);
		} else if (ref.current && !path.includes(ref.current)) {
			callback(event as EventType);
		}
	});

	const eventsKey = eventsList.join(',');

	useEffect(() => {
		if (!isEnabled) {
			return undefined;
		}

		const events = eventsKey.split(',');
		events.forEach((fn) => document.addEventListener(fn, listener));

		return () => {
			events.forEach((fn) => document.removeEventListener(fn, listener));
		};
	}, [eventsKey, isEnabled]);

	return ref;
}
