import type { BehaviorCleanup, BehaviorEntry, ExternalRange } from './behavior-root.js';
import type { NativeHydrationDOM } from './hydration/native-intent.js';

export type Readiness = {
	promise: Promise<void>;
	resolve: () => void;
	reject: (reason: unknown) => void;
	settled: boolean;
};

export type DocumentRegistry = {
	roots: Map<Element, RootRecord>;
	ranges: Map<Element, RangeRecord>;
	capture?: BehaviorCaptureHooks;
};

export type BehaviorDOM = Pick<
	NativeHydrationDOM,
	'element' | 'parent' | 'matches' | 'query' | 'target'
> & {
	contains(container: Element, element: Element, document: Document): boolean;
};

export type RootRecord = {
	container: Element;
	document: Document;
	dom: BehaviorDOM;
	registry: DocumentRegistry;
	controller: AbortController;
	behaviors: Set<EntryRecord>;
	byId: Map<string, EntryRecord>;
	ranges: Set<RangeRecord>;
	pending: Set<Promise<void>>;
	listeners: Map<string, EventListener>;
	observer: MutationObserver | null;
	disposed: boolean;
	unlinkSignal: (() => void) | null;
};

export type RangeRecord = {
	root: RootRecord;
	element: Element;
	owner: unknown;
	controller: AbortController;
	ready: Readiness;
	status: 'pending' | 'ready' | 'failed' | 'disposed';
	unlinks: Array<() => void>;
	publicRange: ExternalRange;
};

export type EntryRecord = {
	root: RootRecord;
	entry: BehaviorEntry;
	controller: AbortController;
	ready: Readiness;
	status: 'pending' | 'active' | 'failed' | 'disposed';
	adoptions: Map<Element, AdoptionRecord>;
	pendingCount: number;
	waiting: Set<RangeRecord>;
	queue: Array<{
		event: Event;
		element: Element;
		range: RangeRecord | undefined;
		payload?: unknown;
		valid?: () => boolean;
	}>;
	head: number;
	flushDepth: number;
	captureDepth?: number;
	unlinks: Array<() => void>;
	scanned: boolean;
};

/** @internal Optional native command ingress; implementations stay outside the core. */
export type BehaviorCaptureHooks = {
	flush(): void;
	skip(root: RootRecord, event: Event): boolean;
	release(entry: EntryRecord): void;
	dispose(root: RootRecord): void;
};

/** @internal Existing FIFO/readiness operations supplied only to an opted-in root. */
export type BehaviorCaptureServices = {
	range(root: RootRecord, element: Element): RangeRecord | undefined;
	matches(entry: EntryRecord, range: RangeRecord | undefined): boolean;
	flush(entry: EntryRecord): void;
	fail(entry: EntryRecord, error: unknown): void;
	canceled: unknown;
};

/** @internal Callable representation of the public opaque capture configuration. */
export type BehaviorCaptureFactory = {
	(
		root: RootRecord,
		flush: BehaviorCaptureServices['flush'],
		fail: BehaviorCaptureServices['fail'],
		range: BehaviorCaptureServices['range'],
		matches: BehaviorCaptureServices['matches'],
		canceled: unknown,
	): void;
	document(container: unknown): Document | null;
};

export type AdoptionRecord = {
	entry: EntryRecord;
	element: Element;
	range: RangeRecord | undefined;
	controller: AbortController;
	unlinks: Array<() => void>;
	cleanup: BehaviorCleanup | undefined;
	pending: boolean;
	disposed: boolean;
};
