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

const container = document.querySelector('#root')!;
const parent = container.querySelector('#hydration-replay-parent')!;
const target = container.querySelector('#hydration-replay-target')!;
const relatedTarget = container.querySelector('#hydration-replay-related')!;
const originalOutcomes: OriginalEventOutcome[] = [];

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
	}
}
