import { bindSignalControl } from 'octane/signals';
import {
	bootstrapStreamedSignalResults,
	installSignalDocumentLifecycle,
} from 'octane/hydration/streamed-signals';
import { body$, draft$, history$ } from '../../conversation-streaming/behavior-only/State.ts';

const readIdentity = () => JSON.parse(document.getElementById('behavior-identity')!.textContent!);
const metadata = readIdentity();
const hydration = bootstrapStreamedSignalResults({
	...metadata,
	initialSignals: JSON.parse(
		document.querySelector('script[data-octane-native-signals]')!.textContent!,
	),
});
const lifecycle = installSignalDocumentLifecycle({
	document,
	...metadata,
	streamedHydration: hydration,
	readIdentity,
});
const control = bindSignalControl(
	document.getElementById('draft') as HTMLTextAreaElement,
	'value',
	draft$,
);
const slot = document.getElementById('automatic-slot')!;
const abort = new AbortController();
let clicks = 0;
let notify: (() => void) | undefined;
let subscriptions = 0;
window.__automaticProbe = () => {
	if (abort.signal.aborted) return { subscriptions, aborted: true };
	const body = body$.snapshot(),
		history = history$.snapshot();
	return {
		subscriptions,
		aborted: abort.signal.aborted,
		bodyRevision: body.status === 'ready' ? body.value.revision : 0,
		historyRevision: history.status === 'ready' ? history.value.revision : 0,
		bodyComplete: body.complete,
		historyComplete: history.complete,
	};
};
const source = {
	getSnapshot() {
		const body = body$.snapshot();
		const history = history$.snapshot();
		// Fresh plain data. Calls, coercions and signal reads stay in the explicit
		// host adapter, outside the automatically accepted view.
		return {
			title: 'Conversation status',
			response:
				body.status === 'ready'
					? `Response revision: ${body.value.revision}`
					: 'Waiting for response',
			history:
				history.status === 'ready'
					? `History revision: ${history.value.revision}`
					: 'Waiting for history',
			interactions: `Interactions: ${clicks}`,
		};
	},
	subscribe(update: () => void) {
		subscriptions++;
		notify = update;
		const stopBody = body$.subscribe(update);
		const stopHistory = history$.subscribe(update);
		return () => {
			subscriptions--;
			if (notify === update) notify = undefined;
			stopBody();
			stopHistory();
		};
	},
};
window.__automaticErrors = [];
let handle: { dispose(): void } | null = null;
window.addEventListener('pagehide', (event) => {
	if (event.persisted) return;
	abort.abort();
	handle?.dispose();
	control();
	lifecycle.dispose();
});
export async function start(
	activate: (
		slot: Element,
		source: typeof source,
		signal: AbortSignal,
	) => unknown | Promise<unknown>,
) {
	handle = (await activate(slot, source, abort.signal)) as { dispose(): void } | null;
	if (abort.signal.aborted) {
		handle?.dispose();
		return;
	}
	document.getElementById('automatic-action')!.addEventListener('click', () => {
		clicks++;
		notify?.();
	});
	window.__automatic = {
		snapshot() {
			const body = body$.snapshot(),
				history = history$.snapshot();
			return {
				clicks,
				subscriptions,
				draft: draft$.get(),
				bodyRevision: body.status === 'ready' ? body.value.revision : 0,
				historyRevision: history.status === 'ready' ? history.value.revision : 0,
				bodyComplete: body.complete,
				historyComplete: history.complete,
				errors: window.__automaticErrors.slice(),
			};
		},
	};
	document.documentElement.dataset.automaticReady = 'true';
}

declare global {
	interface Window {
		__automaticErrors: string[];
		__automaticPreferRenderer?: boolean;
		__automaticProbe: () => {
			subscriptions: number;
			aborted: boolean;
			bodyRevision?: number;
			historyRevision?: number;
			bodyComplete?: boolean;
			historyComplete?: boolean;
		};
		__automatic: { snapshot(): unknown };
	}
}
