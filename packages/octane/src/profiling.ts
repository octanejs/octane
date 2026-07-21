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
 */

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
	/**
	 * Persistent per-live-instance id, stable across `clear()` and shared with
	 * the devtools bridge: equal to the `octane/devtools` tree-node id for the
	 * same instance, so an event row resolves through `inspect()`/`getDomNodes()`.
	 */
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
}

const componentMetadata = new WeakMap<Function, ComponentProfileMetadata>();
const componentSources = new WeakMap<Function, Function>();
const hookMetadata = new Map<symbol, HookProfileMetadata>();
const fallbackMetadata = new WeakMap<Function, ComponentProfileMetadata>();
const trackedComponents = new WeakMap<object, Function>();

/**
 * Persistent subject identity, shared with the devtools bridge: a subject (a
 * render scope/block) keeps one id for its whole life, `ProfileEvent.
 * instanceId` carries it, and `octane/devtools` tree-node ids equal it — so a
 * profiler event row can be handed straight to the bridge's `inspect()` /
 * `getDomNodes()`. Identity deliberately survives `clear()`, which resets
 * recorded data, not who instances are. The reverse map is weakly held and
 * reclaimed by the FinalizationRegistry, so identity never extends an
 * instance's lifetime and needs no periodic pruning. Non-DOM universal
 * renderers may forbid these GC globals, so they are read off a bound global
 * reference; without them only the reverse lookup degrades (to null) — the
 * forward id path never needs them.
 */
const subjectIds = new WeakMap<object, number>();
const subjectRefs = new Map<number, WeakRef<object>>();
const globalScope = globalThis as {
	WeakRef?: { new (target: object): WeakRef<object> };
	FinalizationRegistry?: {
		new (cleanup: (heldValue: number) => void): FinalizationRegistry<number>;
	};
};
const WeakRefCtor = globalScope.WeakRef;
const subjectReclaim =
	globalScope.FinalizationRegistry !== undefined
		? new globalScope.FinalizationRegistry((subjectId) => {
				subjectRefs.delete(subjectId);
			})
		: null;

/** Runtime ABI: the persistent id naming a profiled/inspected subject. */
export function __profileSubjectId(subject: object): number {
	let id = subjectIds.get(subject);
	if (id === undefined) {
		id = nextInstanceId++;
		subjectIds.set(subject, id);
		if (WeakRefCtor !== undefined) {
			subjectRefs.set(id, new WeakRefCtor(subject));
			subjectReclaim?.register(subject, id);
		}
	}
	return id;
}

/** Runtime ABI: the live subject for an id, or null once collected or unknown. */
export function __profileSubjectFor(id: number): object | null {
	return subjectRefs.get(id)?.deref() ?? null;
}

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
		instance = { id: __profileSubjectId(subject), attempts: 0 };
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

/** Runtime ABI: the profiler's clock, shared so bridge events align with profile timings. */
export function __profileNow(): number {
	return now();
}

/** Runtime ABI: registered (or synthesized fallback) metadata for a component function. */
export function __profileMetadataFor(component: Function): ComponentProfileMetadata {
	return metadataFor(component);
}

/** Runtime ABI: compiler hook metadata for a slot symbol, when registered. */
export function __profileHookMetadataFor(slot: symbol): HookProfileMetadata | undefined {
	return hookMetadata.get(slot);
}

/** Runtime ABI: the component tracked for a render scope/block, if any. */
export function __profileTrackedComponentFor(subject: object): Function | undefined {
	return trackedComponents.get(subject);
}

/** Runtime ABI: associate a component-owned render scope without changing its shape. */
export function __profileTrackComponent(subject: object, component: Function | null): void {
	if (component === null) trackedComponents.delete(subject);
	else trackedComponents.set(subject, component);
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
	const frame: ProfileFrame = {
		subject,
		metadata: metadataFor(component),
		instance,
		startTime: now(),
		childDuration: 0,
		phase,
		causes: Array.from(deduped.values()),
		queueDelay: consumed.queueDelay,
		scheduled: consumed.scheduled,
		parent: currentFrame,
		generation: recordingGeneration,
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

function eventMatches(event: ProfileEvent, target: string | Function): boolean {
	if (typeof target === 'function') return event.componentId === metadataFor(target).id;
	return event.component === target || event.componentId === target;
}

export interface OctaneProfiler {
	start(options?: ProfilerStartOptions): void;
	stop(): void;
	clear(): void;
	getEvents(): ProfileEvent[];
	summary(): ProfileSummary[];
	why(component: string | Function): ProfileEvent[];
	exportTrace(): ChromeTrace;
}

declare global {
	// Installed lazily by profile-compiled metadata or profiler.start(), so a
	// normal build does not mutate the global object.
	var __OCTANE_PROFILER__: OctaneProfiler | undefined;
}

export const profiler: OctaneProfiler = {
	start(options) {
		if (options?.bufferSize !== undefined) {
			if (!Number.isSafeInteger(options.bufferSize) || options.bufferSize < 1)
				throw new RangeError('Octane profiler bufferSize must be a positive finite integer.');
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
		// Attempt counters restart, but subject identity is NOT reset: an id
		// names an instance for its whole life so devtools correlation and any
		// retained event copies stay valid across a buffer clear.
		instances = new WeakMap();
		recordingGeneration++;
		currentFrame = null;
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
		for (const event of orderedEvents()) {
			let summary = summaries.get(event.componentId);
			if (summary === undefined) {
				summary = {
					componentId: event.componentId,
					component: event.component,
					file: event.file,
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
					queueDelayTotal: 0,
					queueDelayCount: 0,
					causes: new Map(),
				};
				summaries.set(event.componentId, summary);
			}
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
