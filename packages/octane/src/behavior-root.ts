export { adoptBindings, mountBindings, unbound } from './dom-bindings.js';
export type { BindingSource, BindingOptions, BindingHandle } from './dom-bindings.js';
export type { BindingRange, BindingMountTarget } from './dom-binding-program.js';
import type { CapturedFormSubmission } from './form-submission.js';
import type { FormSubmissionCapture } from './behavior-form-submissions.js';
export type { FormSubmissionCapture } from './behavior-form-submissions.js';
import type {
	AdoptionRecord,
	BehaviorCaptureFactory,
	BehaviorDOM,
	DocumentRegistry,
	EntryRecord,
	RangeRecord,
	Readiness,
	RootRecord,
} from './behavior-root-types.js';
export { captureFormSubmissions } from './behavior-form-submissions.js';
export type { CapturedFormSubmission } from './form-submission.js';

/** A behavior-only root observes existing DOM without taking reconciliation ownership. */
export interface BehaviorRootOptions {
	/** Dispose this root when the enclosing page or document lifetime ends. */
	signal?: AbortSignal;
	/** Explicitly dispose an existing behavior root attached to this container. */
	replace?: boolean;
	/** Explicit synchronous parser-command ingress for this root. */
	formSubmissions?: FormSubmissionCapture;
}

export interface BehaviorDisposeOptions {
	/** Existing DOM is retained unless its removal is explicitly requested. */
	preserveDOM?: boolean;
}

export interface ExternalRangeOptions {
	/** Identity of the component, stream, or application owning this subtree. */
	owner: unknown;
	/** Delay adoption until the independently owned stream is ready. */
	ready?: PromiseLike<unknown>;
	signal?: AbortSignal;
	/** Explicitly hand the same subtree from its previous owner to this owner. */
	replace?: boolean;
}

export interface ExternalRange {
	readonly element: Element;
	readonly owner: unknown;
	readonly signal: AbortSignal;
	readonly ready: Promise<void>;
	dispose(): void;
}

export interface BehaviorContext {
	/** Per-element lifetime, canceled when its adoption or registration ends. */
	readonly signal: AbortSignal;
	/** The original native interaction when adoption was started by that event. */
	readonly event?: Event;
	/** The closest externally owned range, if this target belongs to one. */
	readonly range?: ExternalRange;
}

export type BehaviorCleanup = () => void;

export interface BehaviorEntry<Payload = unknown> {
	id?: string;
	target: string | Element;
	/** Restrict adoption to the closest range belonging to this exact owner. */
	owner?: unknown;
	events?: readonly string[];
	/**
	 * Synchronously capture detached, immutable command arguments on the original
	 * native event, before readiness or adoption. Register eagerly; this cannot
	 * recover earlier values unless the form opted into parser-time submit capture.
	 * Its third argument is the accepted snapshot for those native submissions.
	 * May preventDefault(), but must not return live DOM/state or a promise.
	 */
	captureEvent?(event: Event, element: Element, submission?: CapturedFormSubmission): Payload;
	ready?: PromiseLike<unknown>;
	dependencies?: readonly string[];
	conflicts?: readonly string[];
	signal?: AbortSignal;
	adopt(
		element: Element,
		context: BehaviorContext,
	): void | BehaviorCleanup | PromiseLike<void | BehaviorCleanup>;
	handleEvent?(event: Event, element: Element, context: BehaviorContext, payload: Payload): void;
}

export interface BehaviorRegistration {
	readonly id?: string;
	readonly signal: AbortSignal;
	readonly ready: Promise<void>;
	dispose(): void;
}

export interface BehaviorRoot {
	readonly container: Element;
	readonly signal: AbortSignal;
	/** A snapshot of currently active ranges, registrations, and asynchronous adoptions. */
	readonly ready: Promise<void>;
	registerExternalRange(element: Element, options: ExternalRangeOptions): ExternalRange;
	registerBehavior<Payload = unknown>(entry: BehaviorEntry<Payload>): BehaviorRegistration;
	dispose(options?: BehaviorDisposeOptions): void;
}

const documentRegistries = /* @__PURE__ */ new WeakMap<Document, DocumentRegistry>();
const DEFAULT_DOM: BehaviorDOM = {
	element: isElement,
	parent: (node) => node.parentElement,
	contains: (container, element, document) =>
		element.ownerDocument === document && (element === container || container.contains(element)),
	matches: (element, selector) => element.matches(selector),
	query: (element, selector) => element.querySelectorAll(selector),
	target: targetElement,
};

function registryFor(document: Document): DocumentRegistry {
	let registry = documentRegistries.get(document);
	if (registry === undefined) {
		registry = { roots: new Map(), ranges: new Map() };
		documentRegistries.set(document, registry);
	}
	return registry;
}
const CANCELED = /* @__PURE__ */ Symbol('behavior.canceled');

function createReadiness(): Readiness {
	let resolvePromise!: () => void;
	let rejectPromise!: (reason: unknown) => void;
	const promise = new Promise<void>((resolve, reject) => {
		resolvePromise = resolve;
		rejectPromise = reject;
	});
	// A consumer may register a failing module without reading its handle. Keep
	// the original promise rejectable while preventing host-level unhandled noise.
	void promise.catch(() => undefined);
	const readiness: Readiness = {
		promise,
		settled: false,
		resolve() {
			if (readiness.settled) return;
			readiness.settled = true;
			resolvePromise();
		},
		reject(reason) {
			if (readiness.settled) return;
			readiness.settled = true;
			rejectPromise(reason);
		},
	};
	return readiness;
}

function createController(document: Document): AbortController {
	const Controller = document.defaultView?.AbortController ?? globalThis.AbortController;
	return new Controller();
}

function linkSignal(signal: AbortSignal, controller: AbortController): () => void {
	if (signal.aborted) {
		controller.abort(signal.reason);
		return () => undefined;
	}
	const abort = () => controller.abort(signal.reason);
	signal.addEventListener('abort', abort, { once: true });
	return () => signal.removeEventListener('abort', abort);
}

/** A never-settling third-party promise must not hold a canceled owner open. */
function waitUntilReady(source: PromiseLike<unknown>, signal: AbortSignal): Promise<void> {
	if (signal.aborted) {
		// Attach both continuations even after cancellation: a retained third-party
		// promise may still reject later and must not become an unhandled rejection.
		void Promise.resolve(source).then(undefined, () => undefined);
		return Promise.resolve();
	}
	return new Promise((resolve, reject) => {
		// Native promises preserve the first settlement, including cancellation.
		const complete = () => {
			signal.removeEventListener('abort', complete);
			resolve();
		};
		signal.addEventListener('abort', complete);
		Promise.resolve(source).then(complete, (error) => {
			signal.removeEventListener('abort', complete);
			reject(error);
		});
	});
}

function trackPending(root: RootRecord, promise: Promise<void>): void {
	root.pending.add(promise);
	const remove = () => root.pending.delete(promise);
	void promise.then(remove, remove);
}

function isElement(value: unknown): value is Element {
	return typeof value === 'object' && value !== null && (value as Node).nodeType === 1;
}

function contains(root: RootRecord, element: Element, container = root.container): boolean {
	return root.dom.contains(container, element, root.document);
}

function assertActiveRoot(root: RootRecord): void {
	if (root.disposed || root.controller.signal.aborted) {
		throw new Error('Cannot register behavior on a disposed behavior root.');
	}
}

function assertContainedElement(
	root: RootRecord,
	element: unknown,
	label: string,
): asserts element is Element {
	if (!root.dom.element(element) || !contains(root, element)) {
		throw new Error(`${label} must belong to the behavior root container and document.`);
	}
}

function nearestRange(root: RootRecord, element: Element): RangeRecord | undefined {
	let current: Element | null = element;
	while (current !== null) {
		const range = root.registry.ranges.get(current);
		if (range !== undefined && range.status !== 'disposed' && range.status !== 'failed') {
			return range;
		}
		if (current === root.container) return undefined;
		current = root.dom.parent(current);
	}
	return undefined;
}

function matchesTarget(record: EntryRecord, element: Element): boolean {
	return typeof record.entry.target === 'string'
		? record.root.dom.matches(element, record.entry.target)
		: record.entry.target === element;
}

function rangeMatches(record: EntryRecord, range: RangeRecord | undefined): boolean {
	return (
		record.entry.owner === undefined ||
		(range !== undefined && Object.is(record.entry.owner, range.owner))
	);
}

function dependsOnRange(record: EntryRecord, range: RangeRecord): boolean {
	if (record.waiting.has(range)) return true;
	if (
		record.entry.owner === undefined ||
		!Object.is(record.entry.owner, range.owner) ||
		!contains(record.root, range.element)
	) {
		return false;
	}
	if (typeof record.entry.target !== 'string') {
		return (
			contains(record.root, record.entry.target, range.element) &&
			nearestRange(record.root, record.entry.target) === range
		);
	}
	if (
		record.root.dom.matches(range.element, record.entry.target) &&
		nearestRange(record.root, range.element) === range
	) {
		return true;
	}
	for (const element of record.root.dom.query(range.element, record.entry.target)) {
		if (nearestRange(record.root, element) === range) return true;
	}
	return false;
}

function adoptionContext(adoption: AdoptionRecord, event?: Event): BehaviorContext {
	const context: BehaviorContext = {
		signal: adoption.controller.signal,
		...(adoption.range === undefined ? {} : { range: adoption.range.publicRange }),
		...(event === undefined ? {} : { event }),
	};
	return context;
}

function finishPendingAdoption(adoption: AdoptionRecord): void {
	if (!adoption.pending) return;
	adoption.pending = false;
	adoption.entry.pendingCount--;
}

function disposeAdoption(adoption: AdoptionRecord): void {
	if (adoption.disposed) return;
	adoption.disposed = true;
	finishPendingAdoption(adoption);
	adoption.entry.adoptions.delete(adoption.element);
	adoption.controller.abort();
	for (const unlink of adoption.unlinks) unlink();
	adoption.unlinks.length = 0;
	const cleanup = adoption.cleanup;
	adoption.cleanup = undefined;
	cleanup?.();
}

function flushQueuedEvents(record: EntryRecord): void {
	if (record.status !== 'active' || record.captureDepth) return;
	const queue = record.queue;
	// Recursive native dispatch shares the cursor and defers compaction to the
	// outermost flush so an in-flight item remains stable across callbacks.
	record.flushDepth++;
	try {
		while (record.head < queue.length) {
			const index = record.head;
			const queued = queue[index];
			if (
				queued.payload === CANCELED ||
				!(queued.valid?.() ?? contains(record.root, queued.element))
			) {
				record.head = index + 1;
				continue;
			}
			const range = nearestRange(record.root, queued.element);
			if (range !== queued.range || !rangeMatches(record, range)) {
				record.head = index + 1;
				continue;
			}
			if (range?.status === 'pending') return;
			let adoption = record.adoptions.get(queued.element);
			if (adoption === undefined) {
				adoption = adoptElement(record, queued.element, range, queued.event);
			}
			if (adoption === undefined || adoption.pending) return;
			// Adoption can synchronously dispatch and recursively flush this item.
			if (record.head !== index || queue[index] !== queued) continue;
			record.head = index + 1;
			// Native custody must survive mutations made by synchronous adoption.
			if (queued.valid?.() === false) continue;
			record.entry.handleEvent?.(
				queued.event,
				queued.element,
				adoptionContext(adoption, queued.event),
				queued.payload,
			);
		}
	} finally {
		record.flushDepth--;
		if (record.flushDepth === 0 && record.head !== 0) {
			const consumed = record.head;
			if (consumed >= queue.length) {
				queue.length = 0;
				record.head = 0;
			} else if (consumed >= queue.length - consumed) {
				// Shift only after the dead prefix reaches the live suffix. Across
				// one-event async resumes, shifted suffixes then shrink geometrically
				// while retained storage stays below twice the outstanding events.
				queue.splice(0, consumed);
				record.head = 0;
			}
		}
	}
}

function completeBehavior(record: EntryRecord): void {
	if (record.status !== 'active' || !record.scanned) return;
	for (const range of record.waiting) {
		if (range.status === 'pending') return;
		record.waiting.delete(range);
	}
	if (record.pendingCount !== 0) return;
	flushQueuedEvents(record);
	if (record.queue.length !== 0) return;
	record.ready.resolve();
}

function failBehavior(record: EntryRecord, error: unknown): void {
	if (record.status === 'disposed' || record.status === 'failed') return;
	record.status = 'failed';
	record.ready.reject(error);
	disposeBehavior(record);
}

function adoptElement(
	record: EntryRecord,
	element: Element,
	range: RangeRecord | undefined,
	event?: Event,
): AdoptionRecord | undefined {
	if (
		record.status !== 'active' ||
		!contains(record.root, element) ||
		!rangeMatches(record, range)
	) {
		return undefined;
	}
	if (range?.status === 'pending') {
		record.waiting.add(range);
		return undefined;
	}
	const existing = record.adoptions.get(element);
	if (existing !== undefined) return existing;
	const controller = createController(record.root.document);
	const adoption: AdoptionRecord = {
		entry: record,
		element,
		range,
		controller,
		unlinks: [linkSignal(record.controller.signal, controller)],
		cleanup: undefined,
		pending: false,
		disposed: false,
	};
	if (range !== undefined) adoption.unlinks.push(linkSignal(range.controller.signal, controller));
	if (controller.signal.aborted) return undefined;
	record.adoptions.set(element, adoption);
	let result: ReturnType<BehaviorEntry['adopt']>;
	try {
		result = record.entry.adopt(element, adoptionContext(adoption, event));
	} catch (error) {
		disposeAdoption(adoption);
		failBehavior(record, error);
		return undefined;
	}
	if (typeof result === 'function') {
		if (adoption.disposed || controller.signal.aborted) result();
		else adoption.cleanup = result;
		return adoption;
	}
	if (typeof result === 'object' && result !== null && typeof result.then === 'function') {
		adoption.pending = true;
		record.pendingCount++;
		// The underlying adoption must still be observed after cancellation so a
		// late cleanup can run exactly once, but public readiness races its signal.
		const settled = Promise.resolve(result).then(
			(cleanup) => {
				finishPendingAdoption(adoption);
				if (typeof cleanup === 'function') {
					if (adoption.disposed || adoption.controller.signal.aborted) cleanup();
					else adoption.cleanup = cleanup;
				}
				if (!adoption.disposed) {
					flushQueuedEvents(record);
					completeBehavior(record);
				}
			},
			(error) => {
				finishPendingAdoption(adoption);
				if (adoption.disposed || record.controller.signal.aborted) return;
				disposeAdoption(adoption);
				failBehavior(record, error);
			},
		);
		const cancelable = waitUntilReady(settled, adoption.controller.signal);
		trackPending(record.root, cancelable);
	}
	return adoption;
}

function reconcileBehavior(record: EntryRecord): void {
	if (record.status !== 'active') return;
	record.waiting.clear();
	for (const [element, adoption] of [...record.adoptions]) {
		const contained = contains(record.root, element);
		const range = contained ? nearestRange(record.root, element) : undefined;
		if (
			!contained ||
			!matchesTarget(record, element) ||
			!rangeMatches(record, range) ||
			range !== adoption.range ||
			range?.status === 'pending'
		) {
			disposeAdoption(adoption);
		}
	}
	let elements: Element[];
	if (typeof record.entry.target === 'string') {
		elements = Array.from(record.root.dom.query(record.root.container, record.entry.target));
		if (record.root.dom.matches(record.root.container, record.entry.target))
			elements.unshift(record.root.container);
	} else {
		elements = contains(record.root, record.entry.target) ? [record.entry.target] : [];
	}
	for (const element of elements) {
		const range = nearestRange(record.root, element);
		if (!rangeMatches(record, range)) continue;
		if (range?.status === 'pending') {
			record.waiting.add(range);
			continue;
		}
		adoptElement(record, element, range);
	}
	record.scanned = true;
	completeBehavior(record);
}

function refreshDocument(registry: DocumentRegistry): void {
	registry.capture?.flush();
	for (const root of [...registry.roots.values()]) {
		if (root.disposed) continue;
		for (const record of [...root.behaviors]) reconcileBehavior(record);
	}
}

function ensureObserver(root: RootRecord): void {
	if (root.observer !== null || root.disposed) return;
	const Observer = root.document.defaultView?.MutationObserver ?? globalThis.MutationObserver;
	if (Observer === undefined) return;
	root.observer = new Observer(() => {
		if (root.disposed) return;
		// MutationObserver delivers both sides of a same-tree move together. Check
		// final containment before cleanup so a move preserves its live adoption.
		for (const record of [...root.behaviors]) reconcileBehavior(record);
	});
	root.observer.observe(root.container, { attributes: true, childList: true, subtree: true });
}

function targetElement(event: Event): Element | null {
	const target = event.target;
	if (!target || typeof (target as Node).nodeType !== 'number') return null;
	return (target as Node).nodeType === 1
		? (target as Element)
		: ((target as Node).parentElement ?? null);
}

function handleDelegatedEvent(root: RootRecord, event: Event): void {
	if (root.disposed) return;
	if (root.registry.capture?.skip(root, event)) return;
	const target = root.dom.target(event);
	if (target === null || !contains(root, target)) return;
	for (const record of [...root.behaviors]) {
		if (
			record.status === 'disposed' ||
			record.status === 'failed' ||
			!record.entry.events?.includes(event.type)
		) {
			continue;
		}
		let matched: Element | null = target;
		while (matched !== null && contains(root, matched) && !matchesTarget(record, matched)) {
			if (matched === root.container) {
				matched = null;
				break;
			}
			matched = root.dom.parent(matched);
		}
		if (matched === null || !contains(root, matched)) continue;
		const range = nearestRange(root, matched);
		if (!rangeMatches(record, range)) continue;
		if (record.entry.captureEvent !== undefined) {
			// Reserve native order before application capture: FormData can invoke
			// a formdata listener which synchronously dispatches another command.
			const queued = { event, element: matched, range, payload: CANCELED as unknown };
			record.queue.push(queued);
			if (range?.status === 'pending') record.waiting.add(range);
			record.captureDepth = (record.captureDepth ?? 0) + 1;
			try {
				const payload = record.entry.captureEvent(event, matched);
				// Capture must not authorize delivery after disposal, node removal,
				// or external-owner handoff. The reserved entry is otherwise dropped.
				if (
					!record.controller.signal.aborted &&
					contains(root, matched) &&
					matchesTarget(record, matched) &&
					nearestRange(root, matched) === range
				)
					queued.payload = payload;
			} catch (error) {
				failBehavior(record, error);
				throw error;
			} finally {
				record.captureDepth--;
			}
			flushQueuedEvents(record);
			continue;
		}
		if (record.status !== 'active' || range?.status === 'pending') {
			record.queue.push({ event, element: matched, range });
			if (range?.status === 'pending') record.waiting.add(range);
			continue;
		}
		const adoption = record.adoptions.get(matched) ?? adoptElement(record, matched, range, event);
		if (adoption === undefined || adoption.pending || record.queue.length !== 0) {
			record.queue.push({ event, element: matched, range });
			flushQueuedEvents(record);
			continue;
		}
		record.entry.handleEvent?.(event, matched, adoptionContext(adoption, event), undefined);
	}
}

function installListeners(root: RootRecord, events: readonly string[] | undefined): void {
	if (events === undefined) return;
	for (const event of new Set(events)) {
		if (typeof event !== 'string' || event.length === 0) {
			throw new Error('Behavior event names must be non-empty strings.');
		}
		if (root.listeners.has(event)) continue;
		const listener: EventListener = (nativeEvent) => handleDelegatedEvent(root, nativeEvent);
		root.listeners.set(event, listener);
		root.container.addEventListener(event, listener, true);
	}
}

function removeUnusedListeners(root: RootRecord): void {
	for (const [event, listener] of root.listeners) {
		let used = false;
		for (const record of root.behaviors) {
			if (record.entry.events?.includes(event)) {
				used = true;
				break;
			}
		}
		if (used) continue;
		root.container.removeEventListener(event, listener, true);
		root.listeners.delete(event);
	}
	if (root.behaviors.size === 0) {
		root.observer?.disconnect();
		root.observer = null;
	}
}

function disposeBehavior(record: EntryRecord): void {
	if (record.status === 'disposed') return;
	record.root.registry.capture?.release(record);
	const failed = record.status === 'failed';
	record.status = 'disposed';
	record.controller.abort();
	for (const unlink of record.unlinks) unlink();
	record.unlinks.length = 0;
	record.root.behaviors.delete(record);
	if (record.entry.id !== undefined && record.root.byId.get(record.entry.id) === record) {
		record.root.byId.delete(record.entry.id);
	}
	record.queue.length = 0;
	record.head = 0;
	record.waiting.clear();
	let firstError: unknown;
	for (const adoption of [...record.adoptions.values()]) {
		try {
			disposeAdoption(adoption);
		} catch (error) {
			firstError ??= error;
		}
	}
	if (!failed) record.ready.resolve();
	removeUnusedListeners(record.root);
	if (firstError !== undefined) throw firstError;
}

function activateBehavior(record: EntryRecord): void {
	if (record.status !== 'pending' || record.controller.signal.aborted) return;
	record.status = 'active';
	reconcileBehavior(record);
}

function registerBehavior(root: RootRecord, entry: BehaviorEntry): BehaviorRegistration {
	assertActiveRoot(root);
	if (entry === null || typeof entry !== 'object' || typeof entry.adopt !== 'function') {
		throw new Error('A behavior entry requires an adopt(element, context) function.');
	}
	if (typeof entry.target !== 'string') {
		assertContainedElement(root, entry.target, 'A behavior target');
	} else {
		// Validate selector syntax synchronously, before claiming any registration.
		root.dom.matches(root.container, entry.target);
	}
	if (entry.id !== undefined && root.byId.has(entry.id)) {
		throw new Error(`A behavior with identity ${JSON.stringify(entry.id)} is already registered.`);
	}
	const dependencies: EntryRecord[] = [];
	for (const id of entry.dependencies ?? []) {
		const dependency = root.byId.get(id);
		if (dependency === undefined) {
			throw new Error(`Behavior dependency ${JSON.stringify(id)} is not registered.`);
		}
		dependencies.push(dependency);
	}
	for (const existing of root.behaviors) {
		if (
			(entry.id !== undefined && existing.entry.conflicts?.includes(entry.id)) ||
			(existing.entry.id !== undefined && entry.conflicts?.includes(existing.entry.id))
		) {
			throw new Error('The requested behavior conflicts with an existing behavior registration.');
		}
	}
	const controller = createController(root.document);
	const readiness = createReadiness();
	const record: EntryRecord = {
		root,
		entry,
		controller,
		ready: readiness,
		status: 'pending',
		adoptions: new Map(),
		pendingCount: 0,
		waiting: new Set(),
		queue: [],
		head: 0,
		flushDepth: 0,
		unlinks: [linkSignal(root.controller.signal, controller)],
		scanned: false,
	};
	const registration: BehaviorRegistration = {
		...(entry.id === undefined ? {} : { id: entry.id }),
		signal: controller.signal,
		ready: readiness.promise,
		dispose: () => disposeBehavior(record),
	};
	if (entry.signal !== undefined) record.unlinks.push(linkSignal(entry.signal, controller));
	if (controller.signal.aborted) {
		disposeBehavior(record);
		return registration;
	}
	root.behaviors.add(record);
	if (entry.id !== undefined) root.byId.set(entry.id, record);
	controller.signal.addEventListener('abort', () => disposeBehavior(record), { once: true });
	try {
		installListeners(root, entry.events);
		ensureObserver(root);
		root.registry.capture?.flush();
	} catch (error) {
		disposeBehavior(record);
		throw error;
	}
	const blockers: PromiseLike<unknown>[] = [];
	if (entry.ready !== undefined) blockers.push(entry.ready);
	for (const dependency of dependencies) {
		if (!dependency.ready.settled) blockers.push(dependency.ready.promise);
	}
	if (blockers.length === 0) {
		activateBehavior(record);
	} else {
		const gate = Promise.all(
			blockers.map((blocker) => waitUntilReady(blocker, controller.signal)),
		).then(
			() => activateBehavior(record),
			(error) => {
				if (!controller.signal.aborted) failBehavior(record, error);
			},
		);
		trackPending(root, gate);
	}
	return registration;
}

function disposeRange(record: RangeRecord): void {
	if (record.status === 'disposed') return;
	const failed = record.status === 'failed';
	record.status = 'disposed';
	record.controller.abort();
	for (const unlink of record.unlinks) unlink();
	record.unlinks.length = 0;
	record.root.ranges.delete(record);
	if (record.root.registry.ranges.get(record.element) === record) {
		record.root.registry.ranges.delete(record.element);
	}
	if (!failed) record.ready.resolve();
	if (!record.root.disposed) refreshDocument(record.root.registry);
}

function registerExternalRange(
	root: RootRecord,
	element: Element,
	options: ExternalRangeOptions,
): ExternalRange {
	assertActiveRoot(root);
	assertContainedElement(root, element, 'An externally owned range');
	if (options === null || typeof options !== 'object' || !('owner' in options)) {
		throw new Error('An external range requires an explicit owner identity.');
	}
	const existing = root.registry.ranges.get(element);
	if (existing !== undefined) {
		if (existing.root === root && Object.is(existing.owner, options.owner) && !options.replace) {
			return existing.publicRange;
		}
		if (!options.replace) {
			throw new Error('External ownership conflict: pass replace: true to hand this range off.');
		}
		if (!options.signal?.aborted) disposeRange(existing);
	}
	const controller = createController(root.document);
	const readiness = createReadiness();
	const record: RangeRecord = {
		root,
		element,
		owner: options.owner,
		controller,
		ready: readiness,
		status: options.ready === undefined ? 'ready' : 'pending',
		unlinks: [linkSignal(root.controller.signal, controller)],
		publicRange: undefined as unknown as ExternalRange,
	};
	const range: ExternalRange = {
		element,
		owner: options.owner,
		signal: controller.signal,
		ready: readiness.promise,
		dispose: () => disposeRange(record),
	};
	record.publicRange = range;
	if (options.signal !== undefined) record.unlinks.push(linkSignal(options.signal, controller));
	if (controller.signal.aborted) {
		disposeRange(record);
		return range;
	}
	root.ranges.add(record);
	root.registry.ranges.set(element, record);
	controller.signal.addEventListener('abort', () => disposeRange(record), { once: true });
	refreshDocument(root.registry);
	if (options.ready === undefined) {
		readiness.resolve();
	} else {
		const gate = waitUntilReady(options.ready, controller.signal).then(
			() => {
				if (record.status !== 'pending') return;
				record.status = 'ready';
				refreshDocument(root.registry);
				readiness.resolve();
			},
			(error) => {
				if (controller.signal.aborted || record.status !== 'pending') return;
				try {
					for (const candidateRoot of [...root.registry.roots.values()]) {
						for (const behavior of [...candidateRoot.behaviors]) {
							if (!dependsOnRange(behavior, record)) continue;
							try {
								failBehavior(behavior, error);
							} catch {
								// An adoption cleanup must not replace the originating stream
								// failure or prevent another affected owner from releasing.
							}
						}
					}
				} finally {
					record.status = 'failed';
					readiness.reject(error);
					try {
						disposeRange(record);
					} catch {
						// Refresh callbacks are secondary to releasing the failed range
						// and preserving its original public readiness failure.
					}
				}
			},
		);
		trackPending(root, gate);
	}
	return range;
}

function disposeRoot(root: RootRecord, options: BehaviorDisposeOptions = {}): void {
	if (root.disposed) return;
	root.registry.capture?.dispose(root);
	const releasedExternalOwnership = root.ranges.size !== 0;
	root.disposed = true;
	root.controller.abort();
	root.unlinkSignal?.();
	root.unlinkSignal = null;
	root.observer?.disconnect();
	root.observer = null;
	let firstError: unknown;
	for (const behavior of [...root.behaviors]) {
		try {
			disposeBehavior(behavior);
		} catch (error) {
			firstError ??= error;
		}
	}
	for (const range of [...root.ranges]) {
		try {
			disposeRange(range);
		} catch (error) {
			firstError ??= error;
		}
	}
	for (const [event, listener] of root.listeners) {
		root.container.removeEventListener(event, listener, true);
	}
	root.listeners.clear();
	if (root.registry.roots.get(root.container) === root) {
		root.registry.roots.delete(root.container);
	}
	if (root.registry.roots.size === 0 && root.registry.ranges.size === 0) {
		documentRegistries.delete(root.document);
	}
	if (options.preserveDOM === false) root.container.replaceChildren();
	if (releasedExternalOwnership && root.registry.roots.size !== 0) {
		try {
			refreshDocument(root.registry);
		} catch (error) {
			firstError ??= error;
		}
	}
	if (firstError !== undefined) throw firstError;
}

/**
 * Attach behavior to existing DOM without rendering, replacing, or reconciling it.
 * Every owner, observer, listener, and constructor is scoped to the container's
 * own Document, including elements imported from another JavaScript realm.
 */
export function attachBehaviorRoot(
	container: Element,
	options: BehaviorRootOptions = {},
): BehaviorRoot {
	const capture = options.formSubmissions as unknown as BehaviorCaptureFactory | undefined;
	const document =
		capture === undefined
			? isElement(container)
				? container.ownerDocument
				: null
			: capture.document(container);
	if (document === null) {
		throw new Error('A behavior root requires an element with an owner document.');
	}
	let registry = registryFor(document);
	const existing = registry.roots.get(container);
	if (existing !== undefined) {
		if (!options.replace) {
			throw new Error(
				'This container already has a behavior root; pass replace: true to replace it.',
			);
		}
		if (!options.signal?.aborted) {
			disposeRoot(existing);
			registry = registryFor(document);
		}
	}
	const controller = createController(document);
	const record: RootRecord = {
		container,
		document,
		dom: DEFAULT_DOM,
		registry,
		controller,
		behaviors: new Set(),
		byId: new Map(),
		ranges: new Set(),
		pending: new Set(),
		listeners: new Map(),
		observer: null,
		disposed: false,
		unlinkSignal: null,
	};
	const root: BehaviorRoot = {
		container,
		signal: controller.signal,
		get ready() {
			const waiting: Promise<void>[] = [...record.pending];
			for (const range of record.ranges) waiting.push(range.ready.promise);
			for (const behavior of record.behaviors) waiting.push(behavior.ready.promise);
			const ready = Promise.all(waiting).then(() => undefined);
			void ready.catch(() => undefined);
			return ready;
		},
		registerExternalRange: (element, rangeOptions) =>
			registerExternalRange(record, element, rangeOptions),
		registerBehavior: (entry) => registerBehavior(record, entry),
		dispose: (disposeOptions) => disposeRoot(record, disposeOptions),
	};
	if (options.signal !== undefined) record.unlinkSignal = linkSignal(options.signal, controller);
	if (controller.signal.aborted) {
		disposeRoot(record);
	} else {
		registry.roots.set(container, record);
		try {
			capture?.(record, flushQueuedEvents, failBehavior, nearestRange, rangeMatches, CANCELED);
		} catch (error) {
			disposeRoot(record);
			throw error;
		}
		controller.signal.addEventListener('abort', () => disposeRoot(record), { once: true });
		// Application capture during the synchronous bridge flush may abort this
		// lifetime before its listener has been installed.
		if (controller.signal.aborted) disposeRoot(record);
	}
	return root;
}
