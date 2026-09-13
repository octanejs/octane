import { bindSignalControl, createScope } from 'octane/signals';
import { applyHydrationControlCandidate, captureHydrationControlCandidate } from 'octane/hydration';
import {
	bootstrapStreamedSignalResults,
	installSignalDocumentLifecycle,
} from 'octane/hydration/streamed-signals';
import { draft$, selectedDay$ } from './receipt-state.ts';

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
const control = document.getElementById('draft') as HTMLTextAreaElement;
const initialControl = captureHydrationControlCandidate(control)!;
const scope = createScope({ scopeKey: 'composer-draft-receipts' });
const revision$ = scope.signal$('revision', initialControl.snapshot.editRevision);
// Like a persistence adapter, a receipt observes the document's live draft and
// a local revision. Equal text does not erase the evidence of an intervening edit.
const receipt$ = scope.derived$('snapshot', () =>
	Object.freeze({ value: draft$.get(), revision: scope.get(revision$) }),
);
const renderReceipt = () => {
	const receipt = scope.get(receipt$);
	document.getElementById('draft-length')!.textContent = String(receipt.value.length);
	document.documentElement.dataset.draftReceipt = JSON.stringify(receipt);
};
const renderDay = () => {
	document.getElementById('selected-day')!.textContent = String(selectedDay$.get());
};
const cleanups = [
	bindSignalControl(control, 'value', draft$),
	receipt$.subscribe(renderReceipt),
	selectedDay$.subscribe(renderDay),
];
const edited = () => scope.set(revision$, (revision) => revision + 1);
control.addEventListener('input', edited);
renderReceipt();
renderDay();
const captureRestore$ = () => {
	const candidate = captureHydrationControlCandidate(control);
	return candidate && { candidate, revision: scope.get(revision$) };
};
let restore = initialControl.snapshot.editRevision > 0 ? null : captureRestore$();
document.addEventListener('begin-restore', () => {
	restore = captureRestore$();
});
document.addEventListener('restore-draft', () => {
	const accepted =
		restore !== null &&
		scope.get(revision$) === restore.revision &&
		applyHydrationControlCandidate(restore.candidate, { value: 'restored draft' });
	if (accepted) edited();
	document.documentElement.dataset.restoreAccepted = String(accepted);
});
document.getElementById('day')!.addEventListener('click', () => selectedDay$.set((day) => day + 1));
// This is the same optional application controller as the complete-query case,
// not a runtime capability loader. Its first reads must join the buffered results.
document.getElementById('optional')!.addEventListener('click', async () => {
	const { inspect } = await import('./optional.ts');
	const current = inspect();
	document.getElementById('optional-value')!.textContent = JSON.stringify(current);
	document.getElementById('body-live')!.textContent =
		`${current.body.revision}:${current.body.rows.length}`;
	document.getElementById('history-live')!.textContent =
		`${current.history.revision}:${current.history.rows.length}`;
});
document.documentElement.dataset.behaviorReady = 'true';
document.documentElement.dataset.behaviorReadyState = document.readyState;
performance.mark('behavior-ready');
window.addEventListener('pagehide', (event) => {
	if (!event.persisted) {
		control.removeEventListener('input', edited);
		for (const cleanup of cleanups) cleanup();
		scope.dispose();
		lifecycle.dispose();
	}
});
document.addEventListener('verify-control-identity', () => {
	document.documentElement.dataset.controlSurvived = String(
		document.getElementById('draft') === control,
	);
});
