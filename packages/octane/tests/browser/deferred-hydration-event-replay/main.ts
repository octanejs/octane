import { flushSync, hydrateRoot } from '../../../src/index.js';
import { initializeHydrationEventCapture, interaction } from '../../../src/hydration/index.js';
import {
	createHydrationInteractionEvent,
	HYDRATION_INTERACTION_EVENT_CASES,
	HYDRATION_INTERACTION_EVENT_TYPES,
	observeHydrationReplays,
	type HydrationReplayRecord,
} from '../../hydration/_hydration-interaction-event-matrix.js';
import {
	DeferredHydrationEventReplay,
	DeferredHydrationPressLifecycle,
} from '../../hydration/_fixtures/deferred-hydration-event-replay.tsrx';
import { ActivationSuspendingEditorHydration } from '../../hydration/_fixtures/deferred-hydration-contract.tsrx';

type OriginalEventOutcome = {
	type: string;
	dispatched: boolean;
	defaultPrevented: boolean;
};

type BrowserReplayState = {
	hash: string;
	onHydratedCount: number;
	originalOutcomes: OriginalEventOutcome[];
	records: HydrationReplayRecord[];
	targetSame: boolean;
};

type BrowserEditorEvent = {
	type: string;
	constructorName: string;
	isTrusted: boolean;
	timeStamp: number;
	data: string | null;
	inputType: string | null;
	isComposing: boolean | null;
};

type BrowserEditorState = {
	onHydratedCount: number;
	same: boolean;
	connected: boolean;
	focused: boolean;
	value: string;
	selectionStart: number | null;
	selectionEnd: number | null;
	trustedEvents: BrowserEditorEvent[];
	handledEvents: BrowserEditorEvent[];
};

type BrowserPressEvent = {
	type: string;
	targetId: string | null;
	isTrusted: boolean;
	defaultPrevented: boolean;
	pointerId: number;
	pointerType: string;
	clientX: number;
	clientY: number;
};

type BrowserPressState = {
	onHydratedCount: number;
	originals: BrowserPressEvent[];
	propagated: string[];
	replays: BrowserPressEvent[];
	scrollY: number;
};

const PRESS_EVENTS = ['pointerdown', 'pointermove', 'pointerup', 'pointercancel'] as const;

function pressEvent(event: Event): BrowserPressEvent {
	const pointer = event as PointerEvent;
	return {
		type: pointer.type,
		targetId: (pointer.target as Element | null)?.id ?? null,
		isTrusted: pointer.isTrusted,
		defaultPrevented: pointer.defaultPrevented,
		pointerId: pointer.pointerId,
		pointerType: pointer.pointerType,
		clientX: Math.round(pointer.clientX),
		clientY: Math.round(pointer.clientY),
	};
}

function editorEvent(event: Event): BrowserEditorEvent {
	const input = event as InputEvent;
	return {
		type: event.type,
		constructorName: event.constructor.name,
		isTrusted: event.isTrusted,
		timeStamp: event.timeStamp,
		data: typeof input.data === 'string' ? input.data : null,
		inputType: typeof input.inputType === 'string' ? input.inputType : null,
		isComposing: typeof input.isComposing === 'boolean' ? input.isComposing : null,
	};
}

const container = document.querySelector('#root')!;
const parent = container.querySelector('#hydration-replay-parent')!;
const target = container.querySelector('#hydration-replay-target')!;
const relatedTarget = container.querySelector('#hydration-replay-related')!;
const originalOutcomes: OriginalEventOutcome[] = [];
const editorContainer = document.querySelector('#editor-root')!;
const originalEditor = editorContainer.querySelector('#activation-editor') as HTMLInputElement;
const trustedEditorEvents: BrowserEditorEvent[] = [];

for (const eventName of [
	'pointerdown',
	'touchstart',
	'touchend',
	'focusin',
	'beforeinput',
	'input',
	'compositionstart',
	'compositionupdate',
	'compositionend',
	'click',
]) {
	document.addEventListener(
		eventName,
		(event) => {
			if (event.target === originalEditor && event.isTrusted) {
				trustedEditorEvents.push(editorEvent(event));
			}
		},
		true,
	);
}

// The press boundary stays without a client root until a test hydrates it, so
// trusted input exercises the capture installed before hydrateRoot(). Window
// capture sees each trusted original before Octane's document capture does;
// the document bubble listener sees only the originals capture left alone.
const pressContainer = document.querySelector('#press-root')!;
const pressOriginals: Event[] = [];
const pressPropagated: string[] = [];
const pressReplays: BrowserPressEvent[] = [];
for (const eventName of PRESS_EVENTS) {
	window.addEventListener(
		eventName,
		(event) => {
			if (event.isTrusted && pressContainer.contains(event.target as Node)) {
				pressOriginals.push(event);
			}
		},
		true,
	);
	document.addEventListener(eventName, (event) => {
		if (event.isTrusted && pressContainer.contains(event.target as Node)) {
			pressPropagated.push(event.type);
		}
	});
}

initializeHydrationEventCapture(document);
for (const testCase of HYDRATION_INTERACTION_EVENT_CASES) {
	const event = createHydrationInteractionEvent(window, relatedTarget, testCase);
	originalOutcomes.push({
		type: testCase.type,
		dispatched: target.dispatchEvent(event),
		defaultPrevented: event.defaultPrevented,
	});
}

let onHydratedCount = 0;
let observation: ReturnType<typeof observeHydrationReplays> | undefined;
const root = hydrateRoot(container, DeferredHydrationEventReplay, {
	when: interaction({ events: HYDRATION_INTERACTION_EVENT_TYPES }),
	onHydrated() {
		onHydratedCount++;
		observation = observeHydrationReplays(parent, target);
	},
});
flushSync(() => {});

const editorMode = new URLSearchParams(location.search).get('editor');
if (editorMode !== null) {
	let resolve!: () => void;
	const promise = new Promise<void>((complete) => {
		resolve = complete;
	});
	let onEditorHydratedCount = 0;
	const handledEditorEvents: BrowserEditorEvent[] = [];
	const handleEditorEvent = (event: Event) => {
		handledEditorEvents.push(editorEvent(event));
	};
	const editorRoot = hydrateRoot(editorContainer, ActivationSuspendingEditorHydration, {
		when: interaction(),
		suspend: editorMode === 'async',
		promise,
		onInput: handleEditorEvent,
		onCompositionStart: handleEditorEvent,
		onCompositionEnd: handleEditorEvent,
		onHydrated() {
			onEditorHydratedCount++;
		},
	});
	flushSync(() => {});
	window.__deferredHydrationEditor = {
		resolve,
		state() {
			return {
				onHydratedCount: onEditorHydratedCount,
				same: editorContainer.querySelector('#activation-editor') === originalEditor,
				connected: originalEditor.isConnected,
				focused: document.activeElement === originalEditor,
				value: originalEditor.value,
				selectionStart: originalEditor.selectionStart,
				selectionEnd: originalEditor.selectionEnd,
				trustedEvents: trustedEditorEvents.map((event) => ({ ...event })),
				handledEvents: handledEditorEvents.map((event) => ({ ...event })),
			};
		},
		unmount() {
			editorRoot.unmount();
		},
	};
}

let pressRoot: ReturnType<typeof hydrateRoot> | undefined;
let onPressHydratedCount = 0;
window.__deferredHydrationPress = {
	hydrate() {
		pressRoot = hydrateRoot(pressContainer, DeferredHydrationPressLifecycle, {
			when: interaction({ events: PRESS_EVENTS }),
			onHydrated() {
				onPressHydratedCount++;
				for (const target of pressContainer.querySelectorAll('button')) {
					for (const eventName of PRESS_EVENTS) {
						target.addEventListener(eventName, (event) => {
							pressReplays.push(pressEvent(event));
						});
					}
				}
			},
		});
		flushSync(() => {});
	},
	state() {
		return {
			onHydratedCount: onPressHydratedCount,
			originals: pressOriginals.map(pressEvent),
			propagated: pressPropagated.slice(),
			replays: pressReplays.map((event) => ({ ...event })),
			scrollY: Math.round(window.scrollY),
		};
	},
	unmount() {
		pressRoot?.unmount();
	},
};

function state(): BrowserReplayState {
	return {
		hash: location.hash,
		onHydratedCount,
		originalOutcomes: originalOutcomes.map((outcome) => ({ ...outcome })),
		records: observation?.records.map((record) => ({ ...record })) ?? [],
		targetSame: container.querySelector('#hydration-replay-target') === target,
	};
}

window.__deferredHydrationEventReplay = {
	state,
	unmount() {
		observation?.cleanup();
		root.unmount();
	},
};

declare global {
	interface Window {
		__deferredHydrationEventReplay: {
			state(): BrowserReplayState;
			unmount(): void;
		};
		__deferredHydrationEditor?: {
			resolve(): void;
			state(): BrowserEditorState;
			unmount(): void;
		};
		__deferredHydrationPress: {
			hydrate(): void;
			state(): BrowserPressState;
			unmount(): void;
		};
	}
}
