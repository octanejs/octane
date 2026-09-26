import { bindSignalControl } from 'octane/signals';
import {
	bootstrapStreamedSignalResults,
	installSignalDocumentLifecycle,
} from 'octane/hydration/streamed-signals';
import { body$, draft$, history$ } from '../State.ts';
import { activate } from './activate.tsrx';
import { initialRich, richContent } from './model.ts';
import type { RichConversationProps } from './RichConversation.tsrx';

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
const slot = document.getElementById('rich-slot')!;
const intent = {
	a: { selectedPlace: null as string | null, viewBox: initialRich.viewBox, mapReady: false },
	b: { selectedPlace: null as string | null, viewBox: initialRich.viewBox, mapReady: false },
};
let visit = new AbortController();
let current: 'a' | 'b' = 'a';
let notifyIntent: (() => void) | undefined;
let mapControls: typeof import('./map-interaction.ts') | undefined;
let binding: ReturnType<typeof activate>;
let updates = 0;
let subscriptions = 0;
const recoverableErrors: string[] = [];
const onRecoverableError = (error: unknown) => recoverableErrors.push(String(error));
const revisions: Array<{ body: number; history: number; current: string }> = [];

function source(conversation: 'a' | 'b', signal: AbortSignal) {
	const onActivateMap = async () => {
		mapControls ??= await import('./map-interaction.ts');
		if (signal.aborted) return;
		intent[conversation].mapReady = true;
		notifyIntent?.();
	};
	const onSelectPlace = (id: string) => {
		intent[conversation].selectedPlace = id;
		notifyIntent?.();
	};
	const onZoom = (direction: 'in' | 'out') => {
		intent[conversation].viewBox = mapControls!.zoom(direction);
		notifyIntent?.();
	};
	return {
		getSnapshot(): RichConversationProps {
			const body = body$.snapshot();
			const history = history$.snapshot();
			return {
				...initialRich,
				...(conversation === 'a'
					? richContent(
							body.status === 'ready' ? body.value : null,
							history.status === 'ready' ? history.value : null,
						)
					: { title: 'Conversation B' }),
				...intent[conversation],
				onActivateMap,
				onSelectPlace,
				onZoom,
			};
		},
		subscribe(notify: () => void) {
			subscriptions++;
			const update = () => {
				updates++;
				notify();
			};
			notifyIntent = update;
			const cleanups =
				conversation === 'a' ? [body$.subscribe(update), history$.subscribe(update)] : [];
			return () => {
				subscriptions--;
				if (notifyIntent === update) notifyIntent = undefined;
				for (const cleanup of cleanups) cleanup();
			};
		},
	};
}

function navigate(next: 'a' | 'b') {
	// View retirement releases presentation only. Document result delivery and
	// accepted server work retain their independent lifetime.
	binding.dispose({ preserveDOM: false });
	visit.abort();
	visit = new AbortController();
	current = next;
	binding = activate(slot, source(next, visit.signal), visit.signal, false, onRecoverableError);
}
binding = activate(slot, source('a', visit.signal), visit.signal, true, onRecoverableError);
document.getElementById('rich-visit-b')!.addEventListener('click', () => navigate('b'));
document.getElementById('rich-return-a')!.addEventListener('click', () => navigate('a'));
const trace = () => {
	const body = body$.snapshot(),
		history = history$.snapshot();
	revisions.push({
		body: body.status === 'ready' ? body.value.revision : 0,
		history: history.status === 'ready' ? history.value.revision : 0,
		current,
	});
};
const traceCleanups = [body$.subscribe(trace), history$.subscribe(trace)];
document.documentElement.dataset.behaviorReady = 'true';
window.__richPresentation = {
	snapshot() {
		const body = body$.snapshot(),
			history = history$.snapshot();
		return {
			current,
			updates,
			subscriptions,
			recoverableErrors: recoverableErrors.slice(),
			intent,
			revisions: revisions.slice(),
			bodyRevision: body.status === 'ready' ? body.value.revision : 0,
			historyRevision: history.status === 'ready' ? history.value.revision : 0,
			bodyComplete: body.complete,
			historyComplete: history.complete,
		};
	},
};
window.addEventListener('pagehide', (event) => {
	if (event.persisted) return;
	visit.abort();
	control();
	for (const cleanup of traceCleanups) cleanup();
	lifecycle.dispose();
});

declare global {
	interface Window {
		__richPresentation: { snapshot(): unknown };
	}
}
