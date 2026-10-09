/**
 * Build-specialized client profiler for Octane.
 *
 * The compiler emits the two metadata registration helpers below only when its
 * `profile` option is enabled. runtime.ts likewise calls the render/schedule
 * helpers behind `__OCTANE_PROFILE_ENABLED__`, allowing normal production
 * bundles to tree-shake this module and every profiling branch away.
 *
 * Profiling deliberately stores identities and timings, never live props,
 * state, reducer actions, DOM nodes, errors, or promises.
 *
 * Engine work counters live beside the event buffer. A renderer declares the
 * counters it records when its module loads, and its runtime increments them
 * from profile-guarded probes. Counters are session totals: they are never
 * evicted with buffered events, and only `clear()` resets them.
 */

declare const process: { env: { NODE_ENV?: string } };

/**
 * Version of the counter names and units below. A change to a counter's
 * meaning or unit bumps it, so stored baselines cannot be compared silently
 * across incompatible definitions.
 */
export const PROFILE_COUNTER_SCHEMA = 2;

/**
 * Counter names, in table order. Each counts work attempted, including work a
 * later rollback discards, unless its name says otherwise:
 *
 * - `component.render`: component body invocations, including attempts that
 *   suspend, throw, or replay after a render-phase update.
 * - `component.renderSuspended` / `component.renderErrored`: the subset of
 *   those attempts that ended by suspending or by throwing an error. A throw
 *   ends every component attempt it unwinds through, so a suspended child
 *   rendered inside its parent's body counts for both.
 * - `component.bailout`: memo and implicit bailouts that skipped a body.
 * - `block.create` / `block.unmount`: render Blocks allocated and torn down
 *   (roots, components, directive arms, portals). Lite component scopes are
 *   not Blocks; their work appears as component renders. Neither is a
 *   hookless directive arm mounted with its owner in a root render.
 * - `arm.keep`: `@if`/`@switch` evaluations that re-rendered the current arm.
 * - `arm.swap`: evaluations that replaced the current arm with another,
 *   including an empty arm. A slot's first arm is not a swap.
 * - `boundary.fallback`: Suspense boundaries switching to their fallback.
 * - `boundary.catch`: error boundaries switching to their catch arm.
 * - `scheduler.drain`: passes over the render queue.
 * - `commit.root`: root render transactions accepted for commit.
 * - `rollback.root`: root render transactions rolled back.
 * - `rollback.journalEntries`: journal entries replayed by rollbacks, one per
 *   recorded write, created Block, or rendered Block that was undone.
 * - `rollback.capture`: speculative render captures whose commit work (effects,
 *   refs, bindings) was dropped without becoming visible.
 */
const COUNTER_NAMES = [
	'component.render',
	'component.renderSuspended',
	'component.renderErrored',
	'component.bailout',
	'block.create',
	'block.unmount',
	'arm.keep',
	'arm.swap',
	'boundary.fallback',
	'boundary.catch',
	'scheduler.drain',
	'commit.root',
	'rollback.root',
	'rollback.journalEntries',
	'rollback.capture',
	'component.renderPhaseReplay',
	'block.lite.mount',
	'block.lite.fallback',
	'block.deopt',
	'block.cacheHit',
	'arm.swapOffscreen',
	'for.skip',
	'for.empty.mount',
	'for.empty.unmount',
	'list.reconcile',
	'list.insert',
	'list.remove',
	'list.update',
	'list.move',
	'list.lis',
	'boundary.suspend',
	'boundary.hold',
	'boundary.reveal',
	'boundary.retry',
	'boundary.reset',
	'activity.hide',
	'activity.show',
	'viewTransition.flush',
	'rollback.journal',
	'rollback.transitionDiscarded',
	'rollback.renderInvalidated',
	'rollback.hydration',
	'row.park',
	'flush.sync',
	'flush.transition',
	'flush.deferred',
	'commit.effects',
	'task.post',
	'suspend.throw',
	'use.stratum',
	'cascade.layout',
	'cascade.layoutDepth',
	'effect.run.insertion',
	'effect.run.layout',
	'effect.run.passive',
	'effect.cleanup.insertion',
	'effect.cleanup.layout',
	'effect.cleanup.passive',
	'ref.attach',
	'ref.detach',
] as const;

export type ProfileCounterName = (typeof COUNTER_NAMES)[number];

// A literal, checked against the tuple, so allocating the tables reads no
// property a bundler must preserve (see `counts`).
const COUNTER_COUNT: (typeof COUNTER_NAMES)['length'] = 60;

const COMPONENT_RENDER = 0;
const COMPONENT_RENDER_SUSPENDED = 1;
const COMPONENT_RENDER_ERRORED = 2;
const COMPONENT_BAILOUT = 3;
const BLOCK_CREATE = 4;
const BLOCK_UNMOUNT = 5;
const ARM_KEEP = 6;
const ARM_SWAP = 7;
const BOUNDARY_FALLBACK = 8;
const BOUNDARY_CATCH = 9;
const SCHEDULER_DRAIN = 10;
const COMMIT_ROOT = 11;
const ROLLBACK_ROOT = 12;
const ROLLBACK_JOURNAL_ENTRIES = 13;
const ROLLBACK_CAPTURE = 14;

/** Runtime ABI: numeric slots; referenced only inside profile guards. */
export const enum ProfileCounter {
	RENDER_PHASE_REPLAY = 15,
	BLOCK_LITE_MOUNT = 16,
	BLOCK_LITE_FALLBACK = 17,
	BLOCK_DEOPT = 18,
	BLOCK_CACHE_HIT = 19,
	ARM_SWAP_OFFSCREEN = 20,
	FOR_SKIP = 21,
	FOR_EMPTY_MOUNT = 22,
	FOR_EMPTY_UNMOUNT = 23,
	LIST_RECONCILE = 24,
	LIST_INSERT = 25,
	LIST_REMOVE = 26,
	LIST_UPDATE = 27,
	LIST_MOVE = 28,
	LIST_LIS = 29,
	BOUNDARY_SUSPEND = 30,
	BOUNDARY_HOLD = 31,
	BOUNDARY_REVEAL = 32,
	BOUNDARY_RETRY = 33,
	BOUNDARY_RESET = 34,
	ACTIVITY_HIDE = 35,
	ACTIVITY_SHOW = 36,
	VIEW_TRANSITION_FLUSH = 37,
	ROLLBACK_JOURNAL = 38,
	ROLLBACK_TRANSITION = 39,
	ROLLBACK_INVALIDATED = 40,
	ROLLBACK_HYDRATION = 41,
	ROW_PARK = 42,
	FLUSH_SYNC = 43,
	FLUSH_TRANSITION = 44,
	FLUSH_DEFERRED = 45,
	COMMIT_EFFECTS = 46,
	TASK_POST = 47,
	SUSPEND_THROW = 48,
	USE_STRATUM = 49,
	CASCADE_LAYOUT = 50,
	CASCADE_LAYOUT_DEPTH = 51,
	EFFECT_RUN_INSERTION = 52,
	EFFECT_RUN_LAYOUT = 53,
	EFFECT_RUN_PASSIVE = 54,
	EFFECT_CLEANUP_INSERTION = 55,
	EFFECT_CLEANUP_LAYOUT = 56,
	EFFECT_CLEANUP_PASSIVE = 57,
	REF_ATTACH = 58,
	REF_DETACH = 59,
}

/**
 * Counter totals since the last `clear()`, restricted to the counters at least
 * one installed renderer records. A counter no renderer records is absent,
 * which distinguishes it from a recorded counter that saw no work.
 */
export type ProfileCounters = Partial<Record<ProfileCounterName, number>>;

export interface ProfileCounterSnapshot {
	/** {@link PROFILE_COUNTER_SCHEMA} of the runtime that took the snapshot. */
	schema: number;
	/** Recording generation. `stop()` and `clear()` each start a new one. */
	generation: number;
	/** The runtime's `NODE_ENV` specialization. */
	build: 'development' | 'production';
	/** Renderers that installed counters, sorted. */
	renderers: string[];
	/** Whether counters were incrementing when the snapshot was taken. */
	recording: boolean;
	/** `performance.now()` when the snapshot was taken. */
	time: number;
	counters: ProfileCounters;
}

export interface ProfileCounterDiff {
	schema: number;
	generation: number;
	build: 'development' | 'production';
	renderers: string[];
	/** Milliseconds between the two snapshots. */
	duration: number;
	/** Work counted after `before` and up to `after`. */
	counters: ProfileCounters;
}

export interface ComponentProfileMetadata {
	id: string;
	name: string;
	file: string;
	line: number;
	column: number;
	kind: string;
}

export interface HookProfileMetadata {
	id: string;
	componentId: string;
	name: string;
	kind: string;
	file: string;
	line: number;
	column: number;
	index: number;
}

export interface ProfileCause {
	type: string;
	hook?: string;
	source?: string;
}

export type ProfileOutcome = 'completed' | 'suspended' | 'errored' | 'bailout';

export interface ProfileEvent {
	type: 'component-render' | 'component-bailout';
	componentId: string;
	component: string;
	file: string;
	line: number;
	column: number;
	instanceId: number;
	attempt: number;
	phase: 'mount' | 'update';
	outcome: ProfileOutcome;
	causes: ProfileCause[];
	startTime: number;
	duration: number;
	selfDuration: number;
	queueDelay: number;
	scheduled: boolean;
}

export interface ProfileSummary {
	componentId: string;
	component: string;
	file: string;
	attempts: number;
	completed: number;
	suspended: number;
	errored: number;
	bails: number;
	totalTime: number;
	totalSelfTime: number;
	averageSelfTime: number;
	maxInclusiveTime: number;
	averageQueueDelay: number;
	dominantCause: string | null;
	/** Exclusive work attributed to this component while its body was active. */
	counters: ProfileCounters;
	/** Some component detail has been evicted in this recording. */
	truncated: boolean;
}

export interface ProfilerStartOptions {
	/** Maximum retained events. Oldest entries are discarded first. */
	bufferSize?: number;
	/** Emit Chrome custom-track timestamps when the browser supports them. */
	timeline?: boolean;
}

export interface ChromeTrace {
	traceEvents: Array<{
		name: string;
		cat: string;
		ph: 'X';
		pid: number;
		tid: number;
		ts: number;
		dur: number;
		args: Record<string, unknown>;
	}>;
	displayTimeUnit: 'ms';
}

interface PendingProfile {
	causes: Map<string, ProfileCause>;
	scheduledAt: number;
}

interface InstanceProfile {
	id: number;
	attempts: number;
}

export interface ProfileFrame {
	subject: object;
	metadata: ComponentProfileMetadata;
	instance: InstanceProfile;
	startTime: number;
	childDuration: number;
	phase: 'mount' | 'update';
	causes: ProfileCause[];
	queueDelay: number;
	scheduled: boolean;
	parent: ProfileFrame | null;
	generation: number;
	counters: Float64Array;
}

const componentMetadata = new WeakMap<Function, ComponentProfileMetadata>();
const componentSources = new WeakMap<Function, Function>();
const hookMetadata = new Map<symbol, HookProfileMetadata>();
const fallbackMetadata = new WeakMap<Function, ComponentProfileMetadata>();
const trackedComponents = new WeakMap<object, Function>();

let instances = new WeakMap<object, InstanceProfile>();
let pending = new WeakMap<object, PendingProfile>();
let nextInstanceId = 1;
let nextFallbackId = 1;
let currentFrame: ProfileFrame | null = null;
let active = true;
let recordingGeneration = 0;
let timeline = true;
let bufferSize = 10_000;
let eventBuffer: ProfileEvent[] = [];
let eventHead = 0;
let eventCount = 0;
let pendingTimelineEvents: ProfileEvent[] = [];
// Float64 keeps long sessions exact far beyond 2^32 events. Bundlers cannot
// prove a typed-array constructor pure; without the annotations, a build that
// never calls the profiler would still retain these tables and the name list.
const counts = /* @__PURE__ */ new Float64Array(COUNTER_COUNT);
const counterSupported = /* @__PURE__ */ new Uint8Array(COUNTER_COUNT);
const counterRenderers: string[] = [];
// Several teardown paths can drop the same capture. Count each capture once.
let discardedCaptures = new WeakSet<object>();

/** One accepted DOM root transaction; attempts that roll back remain in session totals. */
export interface ProfileCommit {
	id: number;
	attemptId: number;
	rootId: number;
	/** Queue pass that opened the attempt; null for a synchronous root render. */
	drainId: number | null;
	generation: number;
	time: number;
	counters: ProfileCounters;
}

export interface ProfileCommitHistory {
	commits: ProfileCommit[];
	/** Accepted commits evicted by bufferSize, since clear(). */
	dropped: number;
}

interface CommitRecord {
	id: number;
	attemptId: number;
	rootId: number;
	drainId: number | null;
	generation: number;
	time: number;
	counts: Float64Array;
}

let rootIds = new WeakMap<object, number>();
let transactions = new WeakMap<object, CommitRecord>();
let queuedWork = new WeakMap<object, CommitRecord>();
let queuedCleanups = new WeakMap<object, WeakMap<object, CommitRecord>>();
let currentCommit: CommitRecord | null = null;
let commitStack: Array<CommitRecord | null> = [];
let drainId: number | null = null;
let nextRootId = 1;
let nextAttemptId = 1;
let nextCommitId = 1;
let commits: CommitRecord[] = [];
let commitHead = 0;
let droppedCommits = 0;
const componentCounts = new Map<
	string,
	{ metadata: ComponentProfileMetadata; counts: Float64Array }
>();
let droppedComponents = 0;
let droppedEvents = 0;
let flushPriorities = 0;

function componentTable(metadata: ComponentProfileMetadata): Float64Array {
	let row = componentCounts.get(metadata.id);
	if (row === undefined) {
		if (componentCounts.size === bufferSize) {
			componentCounts.delete(componentCounts.keys().next().value!);
			droppedComponents++;
		}
		row = { metadata, counts: new Float64Array(COUNTER_COUNT) };
		componentCounts.set(metadata.id, row);
	}
	return row.counts;
}

/** O(1) hot probe. No names, snapshots, or events are allocated here. */
export function __profileCount(id: number, amount = 1): void {
	if (!active) return;
	counts[id] += amount;
	if (currentCommit !== null) currentCommit.counts[id] += amount;
	if (currentFrame !== null) currentFrame.counters[id] += amount;
}

/** Enter/restore the runtime's existing root transaction, including nested roots. */
export function __profileRootEnter(transaction: object, owner: object): void {
	if (!active) return;
	commitStack.push(currentCommit);
	let record = transactions.get(transaction);
	if (record === undefined) {
		let rootId = rootIds.get(owner);
		if (rootId === undefined) rootIds.set(owner, (rootId = nextRootId++));
		record = {
			id: 0,
			attemptId: nextAttemptId++,
			rootId,
			drainId,
			generation: recordingGeneration,
			time: 0,
			counts: new Float64Array(COUNTER_COUNT),
		};
		transactions.set(transaction, record);
	}
	currentCommit = record;
}

/** Compiler ABI: the cached region's miss branch did not run. */
export function __profileCacheHit(): void {
	__profileCount(ProfileCounter.BLOCK_CACHE_HIT);
}

export function __profileFlush(): void {
	flushPriorities = 0;
}

export function __profileFlushPriority(priority: number): void {
	const bit = 1 << priority;
	if ((flushPriorities & bit) !== 0) return;
	flushPriorities |= bit;
	__profileCount(ProfileCounter.FLUSH_SYNC + priority);
}

export function __profileRootExit(): void {
	currentCommit = commitStack.pop() ?? null;
}

/** Remember the transaction that queued work, even if it runs after another root commits. */
export function __profileQueueWork(entry: object): void {
	if (active && currentCommit !== null) queuedWork.set(entry, currentCommit);
}

/** Restore attribution while a delayed lifecycle action invokes effects or refs. */
export function __profileWorkEnter(entry: object): void {
	if (!active) return;
	commitStack.push(currentCommit);
	currentCommit = queuedWork.get(entry) ?? currentCommit;
	queuedWork.delete(entry);
}

/** Scope separates a shared cleanup callback used by different roots. */
export function __profileQueueCleanup(
	callback: object,
	scope: object | null,
	source?: object,
): void {
	if (!active || scope === null) return;
	const record = source === undefined ? currentCommit : queuedWork.get(source);
	let callbacks = queuedCleanups.get(scope);
	if (record == null) {
		callbacks?.delete(callback);
		return;
	}
	if (callbacks === undefined) queuedCleanups.set(scope, (callbacks = new WeakMap()));
	callbacks.set(callback, record);
}

/** Phase encoding follows the effect queues: insertion 0, layout 1, passive 2. */
export function __profileEffect(
	phase: number,
	cleanup: boolean,
	entry: object,
	scope: object | null = null,
): void {
	if (!active || phase < 0) return;
	const id =
		(cleanup ? ProfileCounter.EFFECT_CLEANUP_INSERTION : ProfileCounter.EFFECT_RUN_INSERTION) +
		phase;
	counts[id]++;
	if (currentFrame !== null) currentFrame.counters[id]++;
	const callbacks = scope === null ? undefined : queuedCleanups.get(scope);
	const record = (cleanup ? callbacks?.get(entry) : queuedWork.get(entry)) ?? currentCommit;
	if (cleanup) callbacks?.delete(entry);
	else queuedWork.delete(entry);
	if (record !== null && record.generation === recordingGeneration) record.counts[id]++;
}

function orderedCommits(): CommitRecord[] {
	return commits.slice(commitHead).concat(commits.slice(0, commitHead));
}

const MAX_CAUSES = 8;

function now(): number {
	return typeof performance !== 'undefined' && typeof performance.now === 'function'
		? performance.now()
		: Date.now();
}

function source(file: string, line: number, column: number): string {
	return line > 0 ? `${file}:${line}:${column}` : file;
}

function causeKey(cause: ProfileCause): string {
	return `${cause.type}\0${cause.hook ?? ''}\0${cause.source ?? ''}`;
}

function addCause(target: Map<string, ProfileCause>, cause: ProfileCause): void {
	const key = causeKey(cause);
	if (target.has(key) || target.size >= MAX_CAUSES) return;
	target.set(key, cause);
}

function installGlobal(): void {
	const target = globalThis as typeof globalThis & {
		__OCTANE_PROFILER__?: OctaneProfiler;
	};
	try {
		if (target.__OCTANE_PROFILER__ !== profiler) target.__OCTANE_PROFILER__ = profiler;
	} catch {
		// A hardened host may reserve or freeze globals. Structured recording still
		// works through the explicit `octane/profiling` export in that environment.
	}
}

function registeredMetadataFor(component: Function): ComponentProfileMetadata | undefined {
	let current = component;
	// Wrapper chains are normally one or two links (memo/lazy/HMR). The bound
	// prevents a malformed integration from creating an infinite source cycle.
	for (let depth = 0; depth < 32; depth++) {
		const registered = componentMetadata.get(current);
		if (registered !== undefined) return registered;
		const next = componentSources.get(current);
		if (next === undefined || next === current) return undefined;
		current = next;
	}
	return undefined;
}

function metadataFor(component: Function): ComponentProfileMetadata {
	const registered = registeredMetadataFor(component);
	if (registered !== undefined) return registered;
	let fallback = fallbackMetadata.get(component);
	if (fallback === undefined) {
		const name = component.name || '<anonymous>';
		fallback = {
			id: `runtime#${name}:${nextFallbackId++}`,
			name,
			file: '<runtime>',
			line: 0,
			column: 0,
			kind: 'component',
		};
		fallbackMetadata.set(component, fallback);
	}
	return fallback;
}

function instanceFor(subject: object): InstanceProfile {
	let instance = instances.get(subject);
	if (instance === undefined) {
		instance = { id: nextInstanceId++, attempts: 0 };
		instances.set(subject, instance);
	}
	return instance;
}

function consumePending(subject: object): {
	causes: ProfileCause[];
	queueDelay: number;
	scheduled: boolean;
} {
	const entry = pending.get(subject);
	if (entry === undefined) return { causes: [], queueDelay: 0, scheduled: false };
	pending.delete(subject);
	return {
		causes: Array.from(entry.causes.values()),
		queueDelay: Math.max(0, now() - entry.scheduledAt),
		scheduled: true,
	};
}

function orderedEvents(): ProfileEvent[] {
	const ordered = new Array<ProfileEvent>(eventCount);
	for (let index = 0; index < eventCount; index++) {
		ordered[index] = eventBuffer[(eventHead + index) % bufferSize]!;
	}
	return ordered;
}

function resizeEventBuffer(nextSize: number): void {
	droppedEvents += Math.max(0, eventCount - nextSize);
	const retained = orderedEvents().slice(-nextSize);
	bufferSize = nextSize;
	eventBuffer = retained;
	eventHead = 0;
	eventCount = retained.length;
}

function pushEvent(event: ProfileEvent): void {
	if (eventCount < bufferSize) {
		eventBuffer[(eventHead + eventCount) % bufferSize] = event;
		eventCount++;
	} else {
		droppedEvents++;
		eventBuffer[eventHead] = event;
		eventHead = (eventHead + 1) % bufferSize;
	}
	if (!timeline) return;
	pendingTimelineEvents.push(event);
	// A child's timeStamp call would otherwise run while its parent's timer is
	// open and inflate parent self time. Flush the completed child→parent queue
	// only after the outermost frame closes.
	if (currentFrame !== null) return;
	const completed = pendingTimelineEvents;
	pendingTimelineEvents = [];
	let consoleTarget: Console | undefined;
	let stamp: ((...args: unknown[]) => void) | undefined;
	try {
		consoleTarget = globalThis.console;
		stamp = (consoleTarget as any)?.timeStamp;
	} catch {
		// Accessors supplied by a host console must not affect application rendering.
		return;
	}
	if (typeof stamp !== 'function') return;
	for (const completedEvent of completed) {
		try {
			// Chrome's extended console.timeStamp signature creates a duration entry
			// in a named custom track. Other browsers harmlessly ignore extra args.
			stamp.call(
				consoleTarget,
				`${completedEvent.component} (${completedEvent.phase})`,
				completedEvent.startTime,
				completedEvent.startTime + completedEvent.duration,
				'Components',
				'Octane',
				completedEvent.outcome === 'errored'
					? 'error'
					: completedEvent.outcome === 'suspended'
						? 'tertiary-light'
						: 'primary-light',
			);
		} catch {
			// Profiling must never affect application rendering. Some non-Chrome
			// consoles expose timeStamp with a different implementation contract.
		}
	}
}

function isSuspension(value: unknown): boolean {
	return (
		typeof value === 'object' &&
		value !== null &&
		(value as { __isSuspense?: unknown }).__isSuspense === true
	);
}

/** Compiler ABI: attach source metadata without wrapping or replacing the function. */
export function __profileComponent<T extends Function>(
	component: T,
	metadata: ComponentProfileMetadata,
): T {
	if (component.name === '' && metadata.name !== '') {
		try {
			Object.defineProperty(component, 'name', {
				value: metadata.name,
				writable: false,
				enumerable: false,
				configurable: true,
			});
		} catch {
			// A frozen/host function must not make profiling change module evaluation.
		}
	}
	componentMetadata.set(component, Object.freeze({ ...metadata }));
	installGlobal();
	return component;
}

/** Runtime ABI: forward wrapper metadata without adding observable function properties. */
export function __profileComponentSource<T extends Function>(wrapper: T, source: Function): T {
	componentSources.set(wrapper, source);
	const metadata = componentMetadata.get(source);
	if (metadata !== undefined) componentMetadata.set(wrapper, metadata);
	return wrapper;
}

/** Compiler ABI: attach hook source metadata while preserving Symbol identity. */
export function __profileHook(slot: symbol, metadata: HookProfileMetadata): symbol {
	hookMetadata.set(slot, Object.freeze({ ...metadata }));
	installGlobal();
	return slot;
}

/** Runtime ABI: carry a base hook's metadata onto its custom-hook path symbol. */
export function __profileResolveHook(slot: symbol, sourceSlot?: symbol): symbol {
	const metadata = sourceSlot === undefined ? undefined : hookMetadata.get(sourceSlot);
	if (metadata !== undefined) hookMetadata.set(slot, metadata);
	return slot;
}

/** Runtime ABI: distinguish compiler-registered components from renderer helpers. */
export function __profileHasComponentMetadata(component: Function): boolean {
	return registeredMetadataFor(component) !== undefined;
}

/** Runtime ABI: associate a component-owned render scope without changing its shape. */
export function __profileTrackComponent(subject: object, component: Function | null): void {
	if (component === null) trackedComponents.delete(subject);
	else trackedComponents.set(subject, component);
}

/** DevTools reads the existing weak association, including lightweight scopes. */
export function __profileGetComponent(subject: object): Function | undefined {
	return trackedComponents.get(subject);
}

/** Runtime ABI: merge a scheduling reason without retaining the updated value. */
export function __profileSchedule(subject: object, type: string, slot?: symbol | number): void {
	if (!active) return;
	let entry = pending.get(subject);
	if (entry === undefined) {
		entry = { causes: new Map(), scheduledAt: now() };
		pending.set(subject, entry);
	}
	const hook = typeof slot === 'symbol' ? hookMetadata.get(slot) : undefined;
	addCause(entry.causes, {
		type,
		...(hook === undefined
			? null
			: { hook: hook.name, source: source(hook.file, hook.line, hook.column) }),
	});
}

/** Runtime ABI: begin an actual component invocation. */
export function __profileBeginRender(
	subject: object,
	_component: Function,
	mounted: boolean,
): ProfileFrame | null {
	if (!active) return null;
	const component = trackedComponents.get(subject);
	if (component === undefined) return null;
	installGlobal();
	const consumed = consumePending(subject);
	const phase = mounted ? 'update' : 'mount';
	// Causes arriving both directly and through a parent cascade may duplicate.
	const deduped = new Map<string, ProfileCause>();
	// Reserve the first slot for the structural reason so it cannot be displaced
	// by a render that coalesced the maximum number of scheduled hook updates.
	if (phase === 'mount') addCause(deduped, { type: 'mount' });
	else if (currentFrame !== null && currentFrame.subject !== subject)
		addCause(deduped, { type: 'parent' });
	for (const cause of consumed.causes) addCause(deduped, cause);
	if (deduped.size === 0) addCause(deduped, { type: 'unknown' });
	const instance = instanceFor(subject);
	instance.attempts++;
	const metadata = metadataFor(component);
	const frame: ProfileFrame = {
		subject,
		metadata,
		instance,
		startTime: now(),
		childDuration: 0,
		phase,
		causes: Array.from(deduped.values()),
		queueDelay: consumed.queueDelay,
		scheduled: consumed.scheduled,
		parent: currentFrame,
		generation: recordingGeneration,
		counters: componentTable(metadata),
	};
	currentFrame = frame;
	return frame;
}

/** Runtime ABI: close a frame in `finally`, including throws and suspension. */
export function __profileEndRender(
	frame: ProfileFrame | null,
	didThrow: boolean,
	thrown?: unknown,
): void {
	if (frame === null) return;
	const shouldRecord = active && frame.generation === recordingGeneration;
	currentFrame = shouldRecord ? frame.parent : null;
	if (!shouldRecord) return;
	const endTime = now();
	const duration = Math.max(0, endTime - frame.startTime);
	const outcome: ProfileOutcome = !didThrow
		? 'completed'
		: isSuspension(thrown)
			? 'suspended'
			: 'errored';
	counts[COMPONENT_RENDER]++;
	frame.counters[COMPONENT_RENDER]++;
	if (currentCommit !== null) currentCommit.counts[COMPONENT_RENDER]++;
	if (outcome !== 'completed') {
		const id = outcome === 'suspended' ? COMPONENT_RENDER_SUSPENDED : COMPONENT_RENDER_ERRORED;
		counts[id]++;
		frame.counters[id]++;
		if (currentCommit !== null) currentCommit.counts[id]++;
	}
	const event: ProfileEvent = {
		type: 'component-render',
		componentId: frame.metadata.id,
		component: frame.metadata.name,
		file: frame.metadata.file,
		line: frame.metadata.line,
		column: frame.metadata.column,
		instanceId: frame.instance.id,
		attempt: frame.instance.attempts,
		phase: frame.phase,
		outcome,
		causes: frame.causes,
		startTime: frame.startTime,
		duration,
		selfDuration: Math.max(0, duration - frame.childDuration),
		queueDelay: frame.queueDelay,
		scheduled: frame.scheduled,
	};
	if (frame.parent !== null) frame.parent.childDuration += duration;
	pushEvent(event);
}

/** Runtime ABI: record a memo/implicit bailout where the body was not invoked. */
export function __profileBail(subject: object, component: Function, kind: string): void {
	if (!active) return;
	const tracked = trackedComponents.get(subject);
	if (tracked === undefined) return;
	component = tracked;
	counts[COMPONENT_BAILOUT]++;
	componentTable(metadataFor(component))[COMPONENT_BAILOUT]++;
	if (currentCommit !== null) currentCommit.counts[COMPONENT_BAILOUT]++;
	installGlobal();
	const metadata = metadataFor(component);
	const instance = instanceFor(subject);
	const deduped = new Map<string, ProfileCause>();
	addCause(deduped, { type: kind });
	if (currentFrame !== null && currentFrame.subject !== subject)
		addCause(deduped, { type: 'parent' });
	const startTime = now();
	pushEvent({
		type: 'component-bailout',
		componentId: metadata.id,
		component: metadata.name,
		file: metadata.file,
		line: metadata.line,
		column: metadata.column,
		instanceId: instance.id,
		attempt: instance.attempts,
		phase: 'update',
		outcome: 'bailout',
		causes: Array.from(deduped.values()),
		startTime,
		duration: 0,
		selfDuration: 0,
		queueDelay: 0,
		scheduled: false,
	});
}

/**
 * Runtime ABI: declare the counters a renderer records. Called once when the
 * renderer's module loads in a profile build.
 */
export function __profileCounters(renderer: string, names: readonly ProfileCounterName[]): void {
	if (counterRenderers.includes(renderer)) return;
	counterRenderers.push(renderer);
	counterRenderers.sort();
	for (const name of names) {
		const index = COUNTER_NAMES.indexOf(name);
		if (index !== -1) counterSupported[index] = 1;
	}
	installGlobal();
}

/** Runtime ABI: a render Block was allocated. */
export function __profileBlockCreated(): void {
	__profileCount(BLOCK_CREATE);
}

/** Runtime ABI: a render Block was torn down. */
export function __profileBlockUnmounted(): void {
	__profileCount(BLOCK_UNMOUNT);
}

/** Runtime ABI: an `@if`/`@switch` evaluation kept or replaced its arm. */
export function __profileArm(swapped: boolean): void {
	__profileCount(swapped ? ARM_SWAP : ARM_KEEP);
}

/**
 * Runtime ABI: a boundary's branch changed. Branches follow the runtime's try
 * slot encoding: -1 unset, 0 catch, 1 content, 2 pending fallback.
 */
export function __profileBoundary(previous: number, next: number): void {
	if (!active || previous === next) return;
	if (next === 2) __profileCount(BOUNDARY_FALLBACK);
	else if (next === 0) __profileCount(BOUNDARY_CATCH);
	else if (next === 1 && previous === 2) __profileCount(ProfileCounter.BOUNDARY_REVEAL);
}

/** Runtime ABI: the scheduler began a pass over its render queue. */
export function __profileDrain(id?: number): void {
	drainId = id ?? null;
	__profileCount(SCHEDULER_DRAIN);
}

export function __profileDrainEnd(): void {
	drainId = null;
}

/** Runtime ABI: a root render transaction passed validation and committed. */
export function __profileRootCommitted(transaction?: object): void {
	if (!active) return;
	const record = transaction === undefined ? undefined : transactions.get(transaction);
	if (record !== undefined) {
		currentCommit = record;
		record.id = nextCommitId++;
		record.time = now();
		if (commits.length < bufferSize) commits.push(record);
		else {
			commits[commitHead] = record;
			commitHead = (commitHead + 1) % bufferSize;
			droppedCommits++;
		}
	}
	__profileCount(COMMIT_ROOT);
}

/** Runtime ABI: a root render transaction was rolled back. */
export function __profileRootRolledBack(): void {
	__profileCount(ROLLBACK_ROOT);
}

/** Runtime ABI: a rollback replayed `entries` journal entries. */
export function __profileJournalRolledBack(entries: number): void {
	if (entries > 0) {
		__profileCount(ProfileCounter.ROLLBACK_JOURNAL);
		__profileCount(ROLLBACK_JOURNAL_ENTRIES, entries);
	}
}

/** Runtime ABI: a speculative render capture's commit work was dropped. */
export function __profileCaptureDiscarded(capture: object): void {
	if (!active || discardedCaptures.has(capture)) return;
	discardedCaptures.add(capture);
	__profileCount(ROLLBACK_CAPTURE);
}

function currentCounters(table: Float64Array = counts): ProfileCounters {
	const counters: ProfileCounters = {};
	for (let index = 0; index < COUNTER_NAMES.length; index++) {
		if (counterSupported[index] === 1) counters[COUNTER_NAMES[index]] = table[index];
	}
	return counters;
}

function counterSnapshot(): ProfileCounterSnapshot {
	return {
		schema: PROFILE_COUNTER_SCHEMA,
		generation: recordingGeneration,
		build: process.env.NODE_ENV === 'production' ? 'production' : 'development',
		renderers: counterRenderers.slice(),
		recording: active,
		time: now(),
		counters: currentCounters(),
	};
}

function incompatibleSnapshots(reason: string): Error {
	return new Error(`Octane profiler cannot diff these counter snapshots: ${reason}.`);
}

function diffCounterSnapshots(
	before: ProfileCounterSnapshot,
	after: ProfileCounterSnapshot,
): ProfileCounterDiff {
	if (before.schema !== PROFILE_COUNTER_SCHEMA || after.schema !== PROFILE_COUNTER_SCHEMA)
		throw incompatibleSnapshots(
			`this runtime uses counter schema ${PROFILE_COUNTER_SCHEMA}, the snapshots use ${before.schema} and ${after.schema}`,
		);
	if (before.generation !== after.generation)
		throw incompatibleSnapshots('recording was stopped or cleared between them');
	if (!after.recording) throw incompatibleSnapshots('recording was stopped when they were taken');
	if (before.build !== after.build)
		throw incompatibleSnapshots('they come from development and production runtimes');
	if (before.renderers.join('\0') !== after.renderers.join('\0'))
		throw incompatibleSnapshots('the renderers recording counters changed between them');
	const counters: ProfileCounters = {};
	for (const name of COUNTER_NAMES) {
		const start = before.counters[name];
		const end = after.counters[name];
		if (start === undefined && end === undefined) continue;
		if (start === undefined || end === undefined)
			throw incompatibleSnapshots(`only one of them records ${name}`);
		if (end < start) throw incompatibleSnapshots('`before` was taken after `after`');
		counters[name] = end - start;
	}
	return {
		schema: PROFILE_COUNTER_SCHEMA,
		generation: after.generation,
		build: after.build,
		renderers: after.renderers.slice(),
		duration: after.time - before.time,
		counters,
	};
}

function eventMatches(event: ProfileEvent, target: string | Function): boolean {
	if (typeof target === 'function') return event.componentId === metadataFor(target).id;
	return event.component === target || event.componentId === target;
}

export interface OctaneProfiler {
	start(options?: ProfilerStartOptions): void;
	stop(): void;
	clear(): void;
	getEvents(): ProfileEvent[];
	/** Bounded accepted-commit detail; delayed effects update their original record. */
	getCommits(): ProfileCommitHistory;
	summary(): ProfileSummary[];
	why(component: string | Function): ProfileEvent[];
	exportTrace(): ChromeTrace;
	/** Current counter totals; shorthand for `snapshot().counters`. */
	counters(): ProfileCounters;
	/** Counter totals with the envelope `diff()` needs to validate them. */
	snapshot(): ProfileCounterSnapshot;
	/**
	 * Work counted between two snapshots. Throws when the snapshots cannot be
	 * compared: different schemas, builds or renderers, a `stop()` or `clear()`
	 * between them, recording off, or arguments in the wrong order.
	 */
	diff(before: ProfileCounterSnapshot, after: ProfileCounterSnapshot): ProfileCounterDiff;
}

declare global {
	// Installed lazily by profile-compiled metadata, a renderer declaring its
	// counters in a profile build, or profiler.start(), so a normal build does
	// not mutate the global object.
	var __OCTANE_PROFILER__: OctaneProfiler | undefined;
}

export const profiler: OctaneProfiler = {
	start(options) {
		if (options?.bufferSize !== undefined) {
			if (!Number.isSafeInteger(options.bufferSize) || options.bufferSize < 1)
				throw new RangeError('Octane profiler bufferSize must be a positive finite integer.');
			const retained = orderedCommits();
			droppedCommits += Math.max(0, retained.length - options.bufferSize);
			commits = retained.slice(-options.bufferSize);
			commitHead = 0;
			while (componentCounts.size > options.bufferSize) {
				componentCounts.delete(componentCounts.keys().next().value!);
				droppedComponents++;
			}
			resizeEventBuffer(options.bufferSize);
		}
		if (options?.timeline !== undefined) {
			timeline = options.timeline;
			if (!timeline) pendingTimelineEvents = [];
		}
		active = true;
		installGlobal();
	},
	stop() {
		active = false;
		transactions = new WeakMap();
		queuedWork = new WeakMap();
		queuedCleanups = new WeakMap();
		currentCommit = null;
		commitStack = [];
		recordingGeneration++;
		currentFrame = null;
		pending = new WeakMap();
		pendingTimelineEvents = [];
	},
	clear() {
		eventBuffer = [];
		eventHead = 0;
		eventCount = 0;
		pendingTimelineEvents = [];
		pending = new WeakMap();
		instances = new WeakMap();
		nextInstanceId = 1;
		recordingGeneration++;
		currentFrame = null;
		counts.fill(0);
		rootIds = new WeakMap();
		transactions = new WeakMap();
		queuedWork = new WeakMap();
		queuedCleanups = new WeakMap();
		currentCommit = null;
		commitStack = [];
		drainId = null;
		nextRootId = nextAttemptId = nextCommitId = 1;
		commits = [];
		commitHead = droppedCommits = droppedComponents = droppedEvents = flushPriorities = 0;
		componentCounts.clear();
		discardedCaptures = new WeakSet();
	},
	counters() {
		return currentCounters();
	},
	snapshot() {
		return counterSnapshot();
	},
	diff(before, after) {
		return diffCounterSnapshots(before, after);
	},
	getCommits() {
		return {
			commits: orderedCommits().map(({ counts: table, ...record }) => ({
				...record,
				counters: currentCounters(table),
			})),
			dropped: droppedCommits,
		};
	},
	getEvents() {
		return orderedEvents().map((event) => ({
			...event,
			causes: event.causes.map((cause) => ({ ...cause })),
		}));
	},
	summary() {
		const summaries = new Map<
			string,
			ProfileSummary & {
				queueDelayTotal: number;
				queueDelayCount: number;
				causes: Map<string, number>;
			}
		>();
		for (const { metadata, counts: table } of componentCounts.values()) {
			const summary = {
				componentId: metadata.id,
				component: metadata.name,
				file: metadata.file,
				attempts: 0,
				completed: 0,
				suspended: 0,
				errored: 0,
				bails: 0,
				totalTime: 0,
				totalSelfTime: 0,
				averageSelfTime: 0,
				maxInclusiveTime: 0,
				averageQueueDelay: 0,
				dominantCause: null,
				counters: currentCounters(table),
				truncated: droppedComponents > 0 || droppedEvents > 0,
				queueDelayTotal: 0,
				queueDelayCount: 0,
				causes: new Map(),
			};
			summaries.set(metadata.id, summary);
		}
		for (const event of orderedEvents()) {
			const summary = summaries.get(event.componentId);
			if (summary === undefined) continue;
			if (event.type === 'component-bailout') summary.bails++;
			else {
				summary.attempts++;
				summary[event.outcome as 'completed' | 'suspended' | 'errored']++;
				summary.totalTime += event.duration;
				summary.totalSelfTime += event.selfDuration;
				summary.maxInclusiveTime = Math.max(summary.maxInclusiveTime, event.duration);
			}
			if (event.scheduled) {
				summary.queueDelayTotal += event.queueDelay;
				summary.queueDelayCount++;
			}
			for (const cause of event.causes)
				summary.causes.set(cause.type, (summary.causes.get(cause.type) ?? 0) + 1);
		}
		return Array.from(summaries.values())
			.map((summary) => {
				let dominantCause: string | null = null;
				let dominantCount = 0;
				for (const [cause, count] of summary.causes) {
					if (count > dominantCount) {
						dominantCause = cause;
						dominantCount = count;
					}
				}
				const { queueDelayTotal, queueDelayCount, causes: _causes, ...publicSummary } = summary;
				return {
					...publicSummary,
					averageSelfTime: summary.attempts === 0 ? 0 : summary.totalSelfTime / summary.attempts,
					averageQueueDelay: queueDelayCount === 0 ? 0 : queueDelayTotal / queueDelayCount,
					dominantCause,
				};
			})
			.sort((a, b) => b.totalSelfTime - a.totalSelfTime);
	},
	why(component) {
		return orderedEvents()
			.filter((event) => eventMatches(event, component))
			.map((event) => ({ ...event, causes: event.causes.map((cause) => ({ ...cause })) }));
	},
	exportTrace() {
		return {
			displayTimeUnit: 'ms',
			traceEvents: orderedEvents().map((event) => ({
				name: `${event.component} (${event.phase})`,
				cat: 'octane.component',
				ph: 'X',
				pid: 1,
				tid: 1,
				ts: event.startTime * 1000,
				dur: event.duration * 1000,
				args: {
					componentId: event.componentId,
					instanceId: event.instanceId,
					attempt: event.attempt,
					outcome: event.outcome,
					causes: event.causes.map((cause) => ({ ...cause })),
					source: source(event.file, event.line, event.column),
					selfDuration: event.selfDuration,
					queueDelay: event.queueDelay,
					scheduled: event.scheduled,
				},
			})),
		};
	},
};
