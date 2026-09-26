import { runWithSignalOwner, type SignalOwner } from 'octane/signals';
import { session$ } from './State.tsrx';
import { captureSnapshot, exportCapture, recordActivation } from './measurements.ts';
import { projectActions, projectCapture } from './metrics-projection.ts';

// This controller is intentionally limited to the pinned, single-use document
// session. A later pending/error transition cannot transfer a claimed frame to
// the renderer; the probe exposes it as unsupported rather than hiding it.
export function createMetricsController(owner: SignalOwner) {
	let capture = captureSnapshot();
	let exportState = '';
	let disposed = false;
	let observedReady = false;
	let lateStatus: string | null = null;
	let lastStatus = 'unknown';
	let frameNotify: (() => void) | undefined;
	let actionsNotify: (() => void) | undefined;
	let resolveReady!: () => void;
	const ready = new Promise<void>((resolve) => {
		resolveReady = resolve;
	});
	const read = () => runWithSignalOwner(owner, () => session$.snapshot());
	const onExport = () => {
		const snapshot = read();
		if (disposed || snapshot.status !== 'ready') return;
		const run = snapshot.value.run;
		exportState = 'Exporting…';
		actionsNotify?.();
		void exportCapture(run).then(
			() => {
				exportState = 'Exported';
				if (!disposed) actionsNotify?.();
			},
			(error: unknown) => {
				exportState = String(error);
				if (!disposed) actionsNotify?.();
			},
		);
	};
	const changed = () => {
		const snapshot = read();
		lastStatus = snapshot.status;
		if (snapshot.status === 'ready') {
			observedReady = true;
			resolveReady();
		} else if (observedReady) {
			lateStatus = snapshot.status;
		}
		if (snapshot.status === 'ready') actionsNotify?.();
	};
	const unsubscribe = runWithSignalOwner(owner, () => session$.subscribe(changed));
	const frame = {
		getSnapshot: () => ({ ...projectCapture(capture), children: null }),
		subscribe(notify: () => void) {
			frameNotify = notify;
			return () => {
				frameNotify = undefined;
			};
		},
	};
	const actions = {
		getSnapshot() {
			const snapshot = read();
			if (snapshot.status !== 'ready') throw new Error('Metrics session is not ready');
			return projectActions(snapshot.value, exportState, onExport);
		},
		subscribe(notify: () => void) {
			actionsNotify = notify;
			return () => {
				actionsNotify = undefined;
			};
		},
	};
	// Normal Metrics takes its first snapshot before this activation record.
	let timer: ReturnType<typeof setInterval>;
	try {
		changed();
		recordActivation('metrics');
		timer = setInterval(() => {
			capture = captureSnapshot();
			frameNotify?.();
		}, 400);
	} catch (error) {
		unsubscribe();
		throw error;
	}
	return {
		frame,
		actions,
		ready,
		read,
		onExport,
		status: () => ({
			disposed,
			lateStatus,
			status: disposed ? lastStatus : read().status,
			exportState,
		}),
		resetForNegativeControl: () => runWithSignalOwner(owner, () => session$.reset()),
		dispose() {
			if (disposed) return;
			disposed = true;
			clearInterval(timer);
			unsubscribe();
		},
	};
}
