// InteractionProfiler — turns a user interaction into a timed, named,
// render-attributed record. One responsibility: bracket each click/keydown with
// a timing window, aggregate the commits that land inside it, name the target
// via the registry, and publish a bounded History. It depends on the pipeline
// (commits), the registry (naming), and the options (enabled gate) — never on
// any UI. The toolbar renders its records; it does not drive them.
import type { CommitEvent } from '../contract.js';
import type { Pipeline } from '../pipeline.js';
import type { ComponentRegistry } from './registry.js';
import type { OptionsStore } from './options.js';

export type InteractionType = 'click' | 'keyboard';
export type Severity = 'low' | 'needs-improvement' | 'high';

export interface InteractionRender {
	name: string;
	renderCount: number;
	selfTime: number;
	totalTime: number;
}

export interface InteractionRecord {
	id: number;
	type: InteractionType;
	componentName: string;
	componentPath: string[];
	processingTime: number;
	timestamp: number;
	renders: InteractionRender[];
}

/** react-scan's interaction severity thresholds. */
export function severityOf(ms: number): Severity {
	if (ms < 200) return 'low';
	if (ms < 500) return 'needs-improvement';
	return 'high';
}

const MAX_INTERACTIONS = 150;
const SCAN_UI =
	'[data-octane-scan-toolbar], [data-octane-scan-inspector], [data-octane-scan-overlay]';

export interface InteractionProfiler {
	all(): InteractionRecord[];
	clear(): void;
	subscribe(listener: () => void): () => void;
}

function now(): number {
	return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function nextFrame(callback: () => void): void {
	if (typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(() => callback());
	else setTimeout(callback, 16);
}

export function createInteractionProfiler(
	pipeline: Pipeline,
	registry: ComponentRegistry,
	options: OptionsStore,
): InteractionProfiler & { arm(): void; disarm(): void } {
	let records: InteractionRecord[] = [];
	let nextId = 1;
	const listeners = new Set<() => void>();
	let collecting: Map<string, InteractionRender> | null = null;
	let armed = false;
	let detachCommit: (() => void) | null = null;

	function notify(): void {
		for (const listener of listeners) {
			try {
				listener();
			} catch {
				// UI listeners must never break the app being scanned.
			}
		}
	}

	// Aggregate the components that rendered during the open window.
	function onCommit(commit: CommitEvent): void {
		if (collecting === null) return;
		for (const event of commit.events) {
			if (event.type !== 'render') continue;
			const entry = collecting.get(event.component.name) ?? {
				name: event.component.name,
				renderCount: 0,
				selfTime: 0,
				totalTime: 0,
			};
			entry.renderCount++;
			entry.selfTime += event.selfDuration;
			entry.totalTime += event.duration;
			collecting.set(event.component.name, entry);
		}
	}

	function begin(type: InteractionType, target: Element | null): void {
		if (collecting !== null || options.get().enabled === false) return;
		const startInstance = target !== null ? registry.resolveByDom(target) : null;
		const start = now();
		const renders = new Map<string, InteractionRender>();
		collecting = renders;
		// react-scan's detailed-timing state machine: microtask → frame → timeout
		// brackets the interaction's commit.
		queueMicrotask(() =>
			nextFrame(() =>
				setTimeout(() => {
					if (collecting !== renders) return;
					collecting = null;
					const ordered = Array.from(renders.values()).sort((a, b) => b.selfTime - a.selfTime);
					// Re-resolve after the commit landed: a component that rendered in
					// response to the interaction is resolvable now even if it wasn't at
					// the start; fall back to the heaviest render before giving up.
					const endInstance = target !== null ? registry.resolveByDom(target) : null;
					const name =
						endInstance?.component.name ??
						startInstance?.component.name ??
						ordered[0]?.name ??
						'Unknown';
					records.push({
						id: nextId++,
						type,
						componentName: name,
						componentPath: [name],
						processingTime: now() - start,
						timestamp: Date.now(),
						renders: ordered,
					});
					if (records.length > MAX_INTERACTIONS)
						records = records.slice(records.length - MAX_INTERACTIONS);
					notify();
				}, 0),
			),
		);
	}

	function onPointer(event: Event): void {
		const target = event.target;
		if (!(target instanceof Element) || target.closest(SCAN_UI) !== null) return;
		begin('click', target);
	}
	function onKey(event: Event): void {
		const target = event.target instanceof Element ? event.target : null;
		if (target !== null && target.closest(SCAN_UI) !== null) return;
		begin('keyboard', target);
	}

	return {
		arm() {
			if (armed) return;
			armed = true;
			detachCommit = pipeline.onCommit(onCommit);
			if (typeof document !== 'undefined') {
				document.addEventListener('click', onPointer, true);
				document.addEventListener('keydown', onKey, true);
			}
		},
		disarm() {
			if (!armed) return;
			armed = false;
			detachCommit?.();
			detachCommit = null;
			collecting = null;
			if (typeof document !== 'undefined') {
				document.removeEventListener('click', onPointer, true);
				document.removeEventListener('keydown', onKey, true);
			}
		},
		all() {
			return records;
		},
		clear() {
			records = [];
			notify();
		},
		subscribe(listener) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
	};
}
