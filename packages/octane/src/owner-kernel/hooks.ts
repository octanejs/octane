/**
 * Host-neutral hook cells: the first slice of Octane's owner kernel (#1055).
 *
 * A renderer core stores one cell per compiler-assigned hook slot on each
 * owner, and these are the cell shapes and update-queue values every core
 * agrees on, plus the pure helpers that read or advance a cell without
 * touching an owner, root, host record, command, or scheduler. The universal
 * core binds them today; the dedicated Lynx runtime binds the same cells, so
 * hook semantics have one source of truth.
 *
 * Keep this module stateless and free of renderer and host imports. Owner-
 * and batch-shaped dependencies enter only as type parameters, and anything
 * that needs the current attempt, an owner record, or a scheduling service
 * belongs to a later kernel slice behind an explicit services interface.
 */

export type EffectPhase = 'insertion' | 'layout' | 'passive';

export interface StateHook<T = unknown> {
	kind: 'state';
	value: T;
	set: (value: T | ((previous: T) => T)) => void;
	get: () => T;
}

export interface LinkedStateHook<Source = unknown, Value = unknown> {
	kind: 'state';
	linked: true;
	source: Source;
	generation: number;
	generationBase: Value;
	value: Value;
	valueEqual: (previous: Value, next: Value) => boolean;
	set: (value: Value | ((previous: Value) => Value)) => void;
	get?: () => Value;
}

export interface ReducerHook<S = unknown, A = unknown> {
	kind: 'reducer';
	value: S;
	reducer: (state: S, action: A) => S;
	dispatch: (action: A) => void;
	get: () => S;
}

export interface MemoHook<T = unknown> {
	kind: 'memo';
	value: T;
	deps: readonly unknown[] | null;
}

/** `useRef` and `useLazyRef` share this cell; only its creation differs. */
export interface RefHook<T = unknown> {
	kind: 'ref';
	current: T;
	value: { current: T };
}

export interface IdHook {
	kind: 'id';
	value: string;
}

export interface EffectEventCell {
	impl: (...args: any[]) => any;
	active: boolean;
}

export interface EffectEventHook {
	kind: 'effect-event';
	cell: EffectEventCell;
	next: (...args: any[]) => any;
	value: (...args: any[]) => any;
}

/**
 * The one cell that names its owner. The owner is a type parameter so the
 * kernel never depends on a renderer core's owner record; the effect runners
 * below never read it.
 */
export interface EffectHook<Owner = unknown> {
	kind: 'effect';
	owner: Owner;
	slot: unknown;
	phase: EffectPhase;
	create: () => void | (() => void);
	deps: readonly unknown[] | null;
	cleanup: (() => void) | null;
	mounted: boolean;
	previous: EffectHook<Owner> | null;
}

/**
 * Pending state or reducer updates for one hook slot. Urgent updates are the
 * array's elements; a transition-aware core records each update's batch and
 * whether it rebases onto an earlier skipped update in the parallel arrays.
 */
export interface UniversalHookUpdateQueue<Batch = unknown> extends Array<unknown> {
	kind?: 'state' | 'reducer';
	baseState?: unknown;
	batches?: (Batch | null)[];
	rebases?: boolean[];
}

export interface AppliedUniversalUrgentUpdates<Batch = unknown> {
	readonly lane: false;
	readonly queue: UniversalHookUpdateQueue<Batch>;
	readonly consumed: number;
	readonly baseState: unknown;
}

export interface AppliedUniversalLaneUpdates<Batch = unknown> {
	readonly lane: true;
	readonly queue: UniversalHookUpdateQueue<Batch>;
	readonly consumed: number;
	readonly baseState: unknown;
	readonly remainingValues: unknown[];
	readonly remainingBatches: (Batch | null)[];
	readonly remainingRebases: boolean[];
}

export type AppliedUniversalHookUpdates<Batch = unknown> =
	AppliedUniversalUrgentUpdates<Batch> | AppliedUniversalLaneUpdates<Batch>;

export type UniversalTrackedThenable<T = unknown> = PromiseLike<T> & {
	status?: 'pending' | 'fulfilled' | 'rejected';
	value?: T;
	reason?: unknown;
};

/**
 * Explicit dependency-array equality: `Object.is` per position. A `null`
 * array, which the compiler emits for "run every render", never matches, and
 * neither does a length change.
 */
export function depsEqual(
	left: readonly unknown[] | null,
	right: readonly unknown[] | null,
): boolean {
	if (left === null || right === null || left.length !== right.length) return false;
	for (let index = 0; index < left.length; index++) {
		if (!Object.is(left[index], right[index])) return false;
	}
	return true;
}

export function isThenable(value: unknown): value is PromiseLike<unknown> {
	return (
		(value !== null && typeof value === 'object' && typeof (value as any).then === 'function') ||
		(typeof value === 'function' && typeof (value as any).then === 'function')
	);
}

// Instrument an untagged thenable exactly once. A status we did not write, even
// one React does not recognize such as router-core's `'resolved'`, belongs to
// the thenable's owner: leave it alone and treat it as pending, as React's
// trackUsedThenable and the DOM runtime do.
export function trackUniversalThenable<T>(thenable: UniversalTrackedThenable<T>): void {
	if (thenable.status !== undefined) return;
	thenable.status = 'pending';
	thenable.then(
		(value) => {
			thenable.status = 'fulfilled';
			thenable.value = value;
		},
		(error) => {
			thenable.status = 'rejected';
			thenable.reason = error;
		},
	);
}

/** Effects receive their dependency values as arguments. */
export function runEffectCreate<Owner>(hook: EffectHook<Owner>): void {
	const cleanup = (hook.create as (...args: unknown[]) => void | (() => void))(
		...(hook.deps ?? []),
	);
	hook.cleanup = typeof cleanup === 'function' ? cleanup : null;
	hook.mounted = true;
}

/** Clear the cell before running the cleanup, so a throwing cleanup never reruns. */
export function runEffectCleanup<Owner>(hook: EffectHook<Owner>): void {
	const cleanup = hook.cleanup;
	hook.cleanup = null;
	hook.mounted = false;
	cleanup?.();
}

export function deactivateEffectEventCells(cells: readonly EffectEventCell[]): void {
	for (const cell of cells) cell.active = false;
}
