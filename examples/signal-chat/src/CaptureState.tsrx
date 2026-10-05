import { derived$, signal$ } from 'octane/signals';
import { captureSnapshot, exportCapture } from './measurements.ts';

// The capture panel polls browser observations into document state, so its
// island renders from signals and activates without the renderer.
export const capture$ = signal$(captureSnapshot());
export const exportState$ = signal$('');

export const captureEnabled$ = derived$(() => capture$.get().enabled);
export const captureTruncated$ = derived$(() => capture$.get().truncated);
export const observationCount$ = derived$(() => String(capture$.get().observations.length));
export const timings$ = derived$(() => {
	const { observations } = capture$.get();
	return ['shell', 'answer', 'history', 'tools'].map((region) => {
		const observation = observations.find(
			(entry) => entry.region === region && entry.event === 'dom-observed',
		);
		return { region, label: observation ? `${observation.at.toFixed(1)} ms` : '—' };
	});
});
export const observationRows$ = derived$(
	() => capture$.get().observations.map(
		(entry, index) => ({
			index,
			at: entry.at.toFixed(1),
			label: `${entry.region ?? 'document'} · ${entry.event}${
				entry.revision === undefined ? '' : ` · r${entry.revision}`
			}`,
		}),
	),
);

/** Poll the capture while the panel is active; returns its cleanup. */
export function startCapturePolling() {
	capture$.set(captureSnapshot());
	const timer = setInterval(() => capture$.set(captureSnapshot()), 400);
	return () => clearInterval(timer);
}

export function exportBrowserTrace(run: string) {
	exportState$.set('Exporting…');
	void exportCapture(run).then(
		() => exportState$.set('Exported'),
		(error: unknown) => exportState$.set(String(error)),
	);
}

export function traceHref(run: string) {
	return '/__lab/trace?run=' + encodeURIComponent(run);
}
