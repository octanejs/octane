// ReportStore — per-component render aggregation. One responsibility: fold the
// event stream into durable per-component totals (renders, bailouts, timings,
// last-render time). It subscribes to the pipeline; it never touches the DOM,
// the source, or any UI. The inspector and any analytics plugin read it.
import type { InspectionEvent } from '../contract.js';
import type { Pipeline } from '../pipeline.js';

export interface ComponentReport {
	componentId: string;
	component: string;
	file: string;
	renders: number;
	bailouts: number;
	totalTime: number;
	totalSelfTime: number;
	lastRenderAt: number;
}

export interface ReportStore {
	all(): ComponentReport[];
	get(componentId: string): ComponentReport | undefined;
	reset(): void;
}

export function createReportStore(pipeline: Pipeline): ReportStore & { detach(): void } {
	const report = new Map<string, ComponentReport>();

	function record(event: InspectionEvent): void {
		let entry = report.get(event.component.id);
		if (entry === undefined) {
			entry = {
				componentId: event.component.id,
				component: event.component.name,
				file: event.component.file,
				renders: 0,
				bailouts: 0,
				totalTime: 0,
				totalSelfTime: 0,
				lastRenderAt: 0,
			};
			report.set(event.component.id, entry);
		}
		if (event.type === 'bailout') {
			entry.bailouts++;
		} else {
			entry.renders++;
			entry.totalTime += event.duration;
			entry.totalSelfTime += event.selfDuration;
			entry.lastRenderAt = event.startTime;
		}
	}

	const detach = pipeline.onEvent(record);

	return {
		all() {
			return Array.from(report.values(), (entry) => ({ ...entry }));
		},
		get(componentId) {
			const entry = report.get(componentId);
			return entry === undefined ? undefined : { ...entry };
		},
		reset() {
			report.clear();
		},
		detach,
	};
}
