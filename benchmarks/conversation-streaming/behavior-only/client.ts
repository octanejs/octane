import { bindSignalControl } from 'octane/signals';
import { applyHydrationControlCandidate, captureHydrationControlCandidate } from 'octane/hydration';
import {
	bootstrapStreamedSignalHydration,
	installSignalDocumentLifecycle,
} from 'octane/hydration/streamed-signals';
import { body$, draft$, draftLength$, history$, selectedDay$ } from './State.ts';

const readIdentity = () => JSON.parse(document.getElementById('behavior-identity')!.textContent!);
const metadata = readIdentity();
const initialSignals = JSON.parse(
	document.querySelector('script[data-octane-native-signals]')!.textContent!,
);
const hydration = bootstrapStreamedSignalHydration({
	...metadata,
	initialSignals,
});
const lifecycle = installSignalDocumentLifecycle({
	document,
	...metadata,
	streamedHydration: hydration,
	readIdentity,
});
const cleanups = [
	bindSignalControl(document.getElementById('draft') as HTMLTextAreaElement, 'value', draft$),
];
const draftNode = document.getElementById('draft');
const render = (id: string, value: string) => {
	document.getElementById(id)!.textContent = value;
};
function observe<T>(
	handle: { get(): T; subscribe(notify: () => void): () => void },
	id: string,
	format: (value: T) => string = String,
) {
	const update = () => {
		try {
			render(id, format(handle.get()));
		} catch (pending) {
			if (pending && typeof (pending as Promise<unknown>).then === 'function')
				void (pending as Promise<unknown>).then(update, () => render(id, 'error'));
			else render(id, 'error');
		}
	};
	cleanups.push(handle.subscribe(update));
	update();
}
observe(draftLength$, 'draft-length');
observe(selectedDay$, 'selected-day');
// These outputs observe live result-channel state. The transcript lists retain
// the historical first-value HTML emitted by the server; no DOM reconciler runs.
observe(body$, 'body-live', (value) => `${value.revision}:${value.rows.length}`);
observe(history$, 'history-live', (value) => `${value.revision}:${value.rows.length}`);
document.getElementById('day')!.addEventListener('click', () => selectedDay$.set((day) => day + 1));
document.getElementById('optional')!.addEventListener('click', async () => {
	const { inspect } = await import('./optional.ts');
	render('optional-value', JSON.stringify(inspect()));
});
let restoreCandidate = captureHydrationControlCandidate(draftNode!);
if (restoreCandidate!.snapshot.editRevision > 0) restoreCandidate = null;
document.addEventListener('begin-restore', () => {
	restoreCandidate = captureHydrationControlCandidate(draftNode!);
});
// App-owned restore policy uses the framework's exact native edit authority.
document.addEventListener('restore-draft', () => {
	document.documentElement.dataset.restoreAccepted = String(
		restoreCandidate !== null &&
			applyHydrationControlCandidate(restoreCandidate, { value: 'restored draft' }),
	);
});
document.documentElement.dataset.behaviorReady = 'true';
document.documentElement.dataset.behaviorReadyState = document.readyState;
performance.mark('behavior-ready');
window.addEventListener('pagehide', (event) => {
	if (!event.persisted) {
		for (const cleanup of cleanups) cleanup();
		lifecycle.dispose();
	}
});
document.addEventListener('verify-control-identity', () => {
	document.documentElement.dataset.controlSurvived = String(
		document.getElementById('draft') === draftNode,
	);
});
