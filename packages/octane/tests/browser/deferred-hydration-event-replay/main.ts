import { flushSync, hydrateRoot } from '../../../src/index.js';
import { initializeHydrationEventCapture, interaction } from '../../../src/hydration/index.js';
import {
	createHydrationInteractionEvent,
	HYDRATION_INTERACTION_EVENT_CASES,
	HYDRATION_INTERACTION_EVENT_TYPES,
	observeHydrationReplays,
	type HydrationReplayRecord,
} from '../../hydration/_hydration-interaction-event-matrix.js';
import { DeferredHydrationEventReplay } from '../../hydration/_fixtures/deferred-hydration-event-replay.tsrx';
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

function editorEvent(event: Event): BrowserEditorEvent {
	const input = event as InputEvent;
	return {
		type: event.type,
		constructorName: event.constructor.name,
		isTrusted: event.isTrusted,
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
	}
}
