import { flushSync } from 'octane';
import type { RootState, RootStore } from '../core/store.js';
import {
	createEvents,
	getThreeEventPriority,
	type DomEvent,
	type EventManager,
	type Events,
} from '../core/events.js';

const DOM_EVENTS = {
	onClick: ['click', false],
	onContextMenu: ['contextmenu', false],
	onDoubleClick: ['dblclick', false],
	onWheel: ['wheel', true],
	onPointerDown: ['pointerdown', true],
	onPointerUp: ['pointerup', true],
	onPointerLeave: ['pointerleave', true],
	onPointerMove: ['pointermove', true],
	onPointerCancel: ['pointercancel', true],
	onLostPointerCapture: ['lostpointercapture', true],
} as const;

/** Default R3F-compatible event manager for web canvases. */
export function createPointerEvents(store: RootStore): EventManager<HTMLElement> {
	const { handlePointer } = createEvents(store);
	const handlers = Object.fromEntries(
		(Object.keys(DOM_EVENTS) as Array<keyof typeof DOM_EVENTS>).map((name) => {
			const handleEvent = handlePointer(name);
			return [
				name,
				getThreeEventPriority(name) === 'discrete'
					? (event: Event) => flushSync(() => handleEvent(event))
					: handleEvent,
			];
		}),
	) as unknown as Events;

	return {
		priority: 1,
		enabled: true,
		compute(event: DomEvent, state: RootState) {
			state.pointer.set(
				(event.offsetX / state.size.width) * 2 - 1,
				-(event.offsetY / state.size.height) * 2 + 1,
			);
			state.raycaster.setFromCamera(state.pointer, state.camera);
		},
		connected: undefined,
		handlers,
		update() {
			const { events, internal } = store.getState();
			if (internal.lastEvent.current !== null && events.handlers !== undefined) {
				events.handlers.onPointerMove(internal.lastEvent.current);
			}
		},
		connect(target) {
			const { events, set } = store.getState();
			events.disconnect?.();
			set((state) => ({ events: { ...state.events, connected: target } }));
			if (events.handlers === undefined) return;
			for (const name of Object.keys(DOM_EVENTS) as Array<keyof typeof DOM_EVENTS>) {
				const [eventName, passive] = DOM_EVENTS[name];
				target.addEventListener(eventName, events.handlers[name], { passive });
			}
		},
		disconnect() {
			const { events, set } = store.getState();
			if (!events.connected) return;
			if (events.handlers !== undefined) {
				for (const name of Object.keys(DOM_EVENTS) as Array<keyof typeof DOM_EVENTS>) {
					const [eventName] = DOM_EVENTS[name];
					events.connected.removeEventListener(eventName, events.handlers[name]);
				}
			}
			set((state) => ({ events: { ...state.events, connected: undefined } }));
		},
	};
}
