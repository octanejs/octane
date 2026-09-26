import type { captureSnapshot } from './measurements.ts';
import type { LabConfig } from './types.ts';

export function projectCapture(capture: ReturnType<typeof captureSnapshot>) {
	return {
		timings: ['shell', 'answer', 'history', 'tools'].map((region) => {
			const observation = capture.observations.find(
				(entry) => entry.region === region && entry.event === 'dom-observed',
			);
			return {
				key: region,
				name: region,
				value: observation ? `${observation.at.toFixed(1)} ms` : '—',
			};
		}),
		observations: capture.observations.map((entry) => ({
			key: capture.observations.indexOf(entry),
			time: entry.at.toFixed(1),
			text: `${entry.region ?? 'document'} · ${entry.event}${
				entry.revision === undefined ? '' : ` · r${entry.revision}`
			}`,
		})),
		enabled: capture.enabled,
		truncated: capture.truncated,
	};
}

export function projectActions(config: LabConfig, exportState: string, onExport: () => void) {
	return {
		scenario: config.scenario,
		waves: String(config.waves),
		turns: String(config.turns),
		historyRows: String(config.historyRows),
		href: '/__lab/trace?run=' + encodeURIComponent(config.run),
		run: config.run,
		exportState,
		onExport,
	};
}
