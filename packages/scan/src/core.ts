// @octanejs/scan core — the framework-free render-detection engine.
//
// react-scan's engine instruments React's fiber tree (bippy hooking
// onCommitFiberRoot) and walks changed fibers per commit. Octane has no
// fibers; this core instead consumes the profile-build inspection channel
// (`profiler.subscribe()` + `profiler.domNodes()`, docs/octane-scan-port-plan.md),
// which delivers strictly more attribution (schedule causes with source
// locations) without touching renderer internals. Everything here is plain
// data-plumbing so the outline renderer and toolbar phases can sit on top
// without re-aggregating.
import { profiler, __profileComponentId } from 'octane/profiling';
import type { ProfileEvent, ProfileSubscriber } from 'octane/profiling';

/**
 * What a render callback receives. OCTANE DIVERGENCE: react-scan hands its
 * callbacks a React `Fiber`; Octane has no fibers, so callbacks get this
 * stable info object instead. `domNodes()` pull-resolves the instance's
 * current top-level elements (empty after unmount or outside profile builds).
 */
export interface OctaneRenderInfo {
	componentId: string;
	component: string;
	file: string;
	line: number;
	column: number;
	instanceId: number;
	phase: 'mount' | 'update';
	type: 'component-render' | 'component-bailout';
	outcome: ProfileEvent['outcome'];
	causes: ProfileEvent['causes'];
	startTime: number;
	duration: number;
	selfDuration: number;
	domNodes(): Element[];
}

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

export interface Options {
	/** Master switch; `false` detaches from the profiler entirely. */
	enabled?: boolean;
	/** Log per-commit render groups to the console. */
	log?: boolean;
	/** Accepted for react-scan option parity; the toolbar ships in a later phase. */
	showToolbar?: boolean;
	/** Consumed by the outline renderer phase. */
	animationSpeed?: 'slow' | 'fast' | 'off';
	/** Accepted for parity; classification ships with the outline phase. */
	trackUnnecessaryRenders?: boolean;
	onCommitStart?: () => void;
	onCommitFinish?: () => void;
	onRender?: (info: OctaneRenderInfo) => void;
}

const DEFAULT_OPTIONS: Options = {
	enabled: true,
	log: false,
	showToolbar: true,
	animationSpeed: 'fast',
	trackUnnecessaryRenders: false,
};

let options: Options = { ...DEFAULT_OPTIONS };
let detach: (() => void) | null = null;
const report = new Map<string, ComponentReport>();
const componentListeners = new Map<string, Set<(info: OctaneRenderInfo) => void>>();
/** Per-batch render tally, flushed to the console on commit-finish when logging. */
let pendingLog = new Map<string, number>();

function toInfo(event: ProfileEvent): OctaneRenderInfo {
	return {
		componentId: event.componentId,
		component: event.component,
		file: event.file,
		line: event.line,
		column: event.column,
		instanceId: event.instanceId,
		phase: event.phase,
		type: event.type,
		outcome: event.outcome,
		causes: event.causes,
		startTime: event.startTime,
		duration: event.duration,
		selfDuration: event.selfDuration,
		domNodes: () => profiler.domNodes(event.instanceId),
	};
}

function record(event: ProfileEvent): void {
	let entry = report.get(event.componentId);
	if (entry === undefined) {
		entry = {
			componentId: event.componentId,
			component: event.component,
			file: event.file,
			renders: 0,
			bailouts: 0,
			totalTime: 0,
			totalSelfTime: 0,
			lastRenderAt: 0,
		};
		report.set(event.componentId, entry);
	}
	if (event.type === 'component-bailout') entry.bailouts++;
	else {
		entry.renders++;
		entry.totalTime += event.duration;
		entry.totalSelfTime += event.selfDuration;
		entry.lastRenderAt = event.startTime;
	}

	const listeners = componentListeners.get(event.componentId);
	const wantsInfo =
		options.onRender !== undefined || (listeners !== undefined && listeners.size > 0);
	if (wantsInfo) {
		const info = toInfo(event);
		try {
			options.onRender?.(info);
		} catch {
			// Consumer callbacks must never break the app being scanned.
		}
		if (listeners !== undefined) {
			for (const listener of listeners) {
				try {
					listener(info);
				} catch {
					// Consumer callbacks must never break the app being scanned.
				}
			}
		}
	}
	if (options.log === true && event.type === 'component-render') {
		pendingLog.set(event.component, (pendingLog.get(event.component) ?? 0) + 1);
	}
}

const subscriber: ProfileSubscriber = {
	event: record,
	commitStart() {
		try {
			options.onCommitStart?.();
		} catch {
			// Consumer callbacks must never break the app being scanned.
		}
	},
	commitFinish() {
		try {
			options.onCommitFinish?.();
		} catch {
			// Consumer callbacks must never break the app being scanned.
		}
		if (options.log === true && pendingLog.size > 0) {
			for (const [component, count] of pendingLog) {
				// eslint-disable-next-line no-console
				console.log(`[octane-scan] ${component} ×${count}`);
			}
		}
		pendingLog = new Map();
	},
};

function applyEnabled(): void {
	const shouldRun = options.enabled !== false;
	if (shouldRun && detach === null) {
		profiler.start();
		detach = profiler.subscribe(subscriber);
	} else if (!shouldRun && detach !== null) {
		detach();
		detach = null;
		pendingLog = new Map();
	}
}

/**
 * Start scanning (idempotent), merging any provided options. Enables unless
 * the caller says otherwise — `scan()` after a `setOptions({ enabled: false })`
 * resumes, matching react-scan.
 */
export function scan(next: Options = {}): void {
	setOptions({ enabled: true, ...next });
}

export function setOptions(next: Partial<Options>): void {
	options = { ...options, ...next };
	applyEnabled();
}

export function getOptions(): Options {
	return { ...options };
}

/** Aggregated per-component render counts and timings since the last reset. */
export function getReport(): ComponentReport[] {
	return Array.from(report.values(), (entry) => ({ ...entry }));
}

/** Test/devtools hygiene: drop aggregation and detach without losing options. */
export function resetReport(): void {
	report.clear();
	pendingLog = new Map();
}

/**
 * Observe renders of one component. Matches react-scan's
 * `onRender(Component, callback)`; the callback receives `OctaneRenderInfo`
 * (see the divergence note there). Returns the detach function.
 */
export function onRender(
	component: Function,
	callback: (info: OctaneRenderInfo) => void,
): () => void {
	const componentId = __profileComponentId(component);
	let listeners = componentListeners.get(componentId);
	if (listeners === undefined) {
		listeners = new Set();
		componentListeners.set(componentId, listeners);
	}
	listeners.add(callback);
	applyEnabled();
	return () => {
		const current = componentListeners.get(componentId);
		current?.delete(callback);
		if (current?.size === 0) componentListeners.delete(componentId);
	};
}
