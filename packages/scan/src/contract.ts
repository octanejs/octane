// The inspection contract — the single framework-agnostic boundary the whole
// scan subsystem is built on. NOTHING above an InspectionSource is allowed to
// know whether events came from Octane Blocks/Scopes, React fibers, Signals, or
// compiler metadata. An engine adapter normalizes its native render signal into
// these immutable events; every service, plugin, and UI consumes only this.
//
// Why this shape works for any engine: identity, phase, timings, schedule
// causes, and a lazy DOM lookup are concepts every reactive renderer can
// produce — React derives them from fibers, Octane from the profile-build
// inspection channel, a future Solid/Vue adapter from its own runtime — while
// no engine-specific handle (no Fiber, no Block) ever leaks upward.

/** Compile-time identity of a component; stable across an instance's renders. */
export interface ComponentIdentity {
	/** Stable id keyed by the component's definition (not the instance). */
	readonly id: string;
	readonly name: string;
	readonly file: string;
	readonly line: number;
	readonly column: number;
}

/**
 * Why an instance rendered. Engine-neutral: a hook/signal/prop write with an
 * optional human name and source location. React can synthesize these from
 * prop diffs; Octane records them directly from the scheduler.
 */
export interface ScheduleCause {
	readonly type: string;
	readonly hook?: string;
	readonly source?: string;
}

export type RenderPhase = 'mount' | 'update';
export type EventType = 'render' | 'bailout';
export type RenderOutcome = 'completed' | 'suspended' | 'errored' | 'bailed';

/**
 * One immutable render observation. `domNodes()` is a LAZY pull — never eager,
 * never retained — so an event can be kept indefinitely (reports, history,
 * time-travel) without pinning DOM or leaking memory. Consumers that need
 * geometry call it at the moment they draw.
 */
export interface InspectionEvent {
	readonly id: number;
	readonly type: EventType;
	readonly component: ComponentIdentity;
	readonly instanceId: number;
	readonly phase: RenderPhase;
	readonly outcome: RenderOutcome;
	readonly startTime: number;
	readonly duration: number;
	readonly selfDuration: number;
	readonly causes: readonly ScheduleCause[];
	/** Lazily resolve this instance's current top-level DOM elements. */
	domNodes(): Element[];
}

/** A committed batch of render observations, with its wall-clock boundary. */
export interface CommitEvent {
	readonly id: number;
	readonly startTime: number;
	readonly events: readonly InspectionEvent[];
}

/**
 * What an engine adapter can offer. Consumers degrade gracefully rather than
 * assuming a feature exists — e.g. the inspector hides a parent breadcrumb when
 * `hierarchy` is false, so an engine that can't walk owners still works.
 */
export interface SourceCapabilities {
	readonly causes: boolean;
	readonly timings: boolean;
	readonly domRanges: boolean;
	readonly hierarchy: boolean;
	readonly propsInspection: boolean;
}

/** Where an InspectionSource delivers normalized events + commit boundaries. */
export interface InspectionSink {
	event(event: InspectionEvent): void;
	commitStart?(): void;
	commitFinish?(): void;
}

/**
 * The engine adapter. `@octanejs/scan` ships the Octane adapter; a React,
 * Preact, Solid, or custom-runtime adapter would implement this same interface
 * and the entire subsystem above it works unchanged.
 */
export interface InspectionSource {
	readonly name: string;
	readonly capabilities: SourceCapabilities;
	/** Begin producing events (idempotent). Adapters may start eagerly. */
	start(): void;
	/** Stop producing events (indexing/buffering may continue if cheap). */
	stop(): void;
	/** Attach a sink; returns a detach function. */
	subscribe(sink: InspectionSink): () => void;
	/** Pull an instance's current top-level DOM elements. */
	domNodes(instanceId: number): Element[];
	/** Replay already-observed events (adapters with a buffer) for backfill. */
	bufferedEvents(): Iterable<InspectionEvent>;
	/** Optional owner lookup when `capabilities.hierarchy` is true. */
	parentInstance?(instanceId: number): number | null;
}
