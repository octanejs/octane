import { formatClientError } from '../error-codes.client.generated.js';
import { SignalFrameError } from './errors.js';
import {
	EffectNode,
	PlainCell,
	PlainComputed,
	addEffect,
	assertAlive,
	assertWritable,
	computeEqual,
	effectRing,
	endSignalBatch,
	executeEffect,
	presentDuringFlush,
	retireGraph,
	setEquals,
	setWatched,
	signalBatch,
	signalTransaction,
	startSignalBatch,
	stopEffect,
	type GraphOwner,
	type SignalObserver,
	type ScopedNode,
} from './graph.js';
import { registerNativeBatchHooks, registerNativeSignalHydration } from './read-protocol.js';
import type {
	AdoptionFrame,
	ScopeSeed,
	Scope,
	ScopeSignalOptions,
	SignalEquals,
	SignalHandle,
	SignalTraceEvent,
	WritableSignal,
	DerivedSignal,
} from './types.js';

registerNativeBatchHooks({
	startBatch: startSignalBatch,
	endBatch: endSignalBatch,
	present: presentDuringFlush,
});
registerNativeSignalHydration();

export function requireKey(key: string, label: string): void {
	if (typeof key !== 'string' || !key.trim()) {
		throw new TypeError(formatClientError(125, label));
	}
}

/** `scope.effect`'s stop, bound to its effect, as small as alien-signals' own. */
function stopScopeEffect(this: EffectNode): void {
	if (this.run !== undefined || this.cleanup !== undefined) stopEffect(this);
}

/** A Scope signal's `equals`, or undefined when Object.is alone compares its values; checks `watched` too. */
export function equalsOption<T>(
	options: ScopeSignalOptions<T> | undefined,
): SignalEquals<T> | undefined {
	if (options === undefined) return undefined;
	if (options === null || typeof options !== 'object') throw new TypeError(formatClientError(160));
	const equals = options.equals;
	if (equals !== undefined && typeof equals !== 'function')
		throw new TypeError(formatClientError(366));
	const watched = options.watched;
	if (watched !== undefined && typeof watched !== 'function')
		throw new TypeError(formatClientError(367));
	return equals;
}

/** Ownership shared by keyless graphs and full scopes. */
export class ScopeLifetime implements GraphOwner {
	readonly observers = new Set<SignalObserver>();
	private lifetime = 0;
	disposed = false;
	/** Effects this scope stops when it retires. */
	effects: EffectNode | undefined = undefined;
	heldCells: Set<PlainCell> | undefined = undefined;

	constructor(
		protected readonly key: string,
		readonly seedable: boolean = false,
		readonly traceLimit: number = 0,
	) {
		requireKey(key, 'scopeKey');
	}

	beginAdoption(_seed: ScopeSeed): AdoptionFrame {
		throw new SignalFrameError(formatClientError(142));
	}

	trace(_type: SignalTraceEvent['type'], _node?: ScopedNode): void {}

	get scopeKey(): string {
		return this.key;
	}

	get epoch(): number {
		return this.lifetime;
	}

	get retired(): boolean {
		return this.disposed;
	}

	protected stopEffectsAndRetire(): void {
		// Effects stop first, so their cleanups still read this scope's values.
		const ring = this.effects;
		if (ring !== undefined) {
			while (ring.next !== ring) stopEffect(ring.next!);
		}
		this.disposed = true;
		this.lifetime++;
	}
}

type Operations = Pick<Scope, 'batch' | 'effect' | 'transaction'>;

export function installScopeOperations(prototype: Operations): void {
	prototype.batch = function <T>(this: ScopeLifetime, write: () => T): T {
		assertAlive(this);
		return signalBatch(write);
	};
	prototype.transaction = function <T>(this: ScopeLifetime, write: () => T) {
		assertAlive(this);
		if (typeof write !== 'function') throw new TypeError(formatClientError(368));
		return signalTransaction(write);
	};
	prototype.effect = function (this: ScopeLifetime, run: () => void | (() => void)): () => void {
		assertAlive(this);
		assertWritable();
		if (typeof run !== 'function') throw new TypeError(formatClientError(363));
		const effect = new EffectNode(run);
		addEffect((this.effects ??= effectRing()), effect);
		startSignalBatch();
		try {
			executeEffect(effect);
		} catch (error) {
			stopEffect(effect);
			throw error;
		} finally {
			endSignalBatch();
		}
		return stopScopeEffect.bind(effect);
	};
}

export function deriveKeyless<T>(
	owner: ScopeLifetime,
	compute: () => T,
	options: ScopeSignalOptions<T> | undefined,
	equals: SignalEquals<T> | undefined,
): DerivedSignal<T> {
	assertAlive(owner);
	const node = new PlainComputed<T>(compute);
	if (equals) node.getter = computeEqual(node, compute, equals);
	if (options?.watched) setWatched(node, options.watched);
	return node as unknown as DerivedSignal<T>;
}

/** A synchronous native scope whose cells and derived values use null keys. */
export interface KeylessScope extends Pick<
	Scope,
	'scopeKey' | 'epoch' | 'retired' | 'get' | 'set' | 'dispose' | 'batch' | 'effect' | 'transaction'
> {
	signal$<T>(key: null, initial: T, options?: ScopeSignalOptions<T>): WritableSignal<T>;
	derived$<T>(
		key: null,
		compute: (() => T) & (T extends PromiseLike<unknown> ? never : unknown),
		options?: ScopeSignalOptions<T>,
	): DerivedSignal<T>;
}

function requireKeyless(key: null): void {
	if (key !== null) throw new TypeError(formatClientError(372));
}

class KeylessScopeImpl extends ScopeLifetime implements KeylessScope {
	declare batch: Scope['batch'];
	declare transaction: Scope['transaction'];
	declare effect: Scope['effect'];

	signal$<T>(key: null, initial: T, options?: ScopeSignalOptions<T>): WritableSignal<T> {
		requireKeyless(key);
		const equals = equalsOption(options);
		assertAlive(this);
		const node = new PlainCell(initial, this);
		if (equals !== undefined) setEquals(node, equals);
		if (options?.watched) setWatched(node, options.watched);
		return node as unknown as WritableSignal<T>;
	}
	derived$<T>(
		key: null,
		compute: (() => T) & (T extends PromiseLike<unknown> ? never : unknown),
		options?: ScopeSignalOptions<T>,
	): DerivedSignal<T> {
		requireKeyless(key);
		if (typeof compute !== 'function') throw new TypeError(formatClientError(122));
		return deriveKeyless(this, compute, options, equalsOption(options));
	}
	get<T>(handle$: SignalHandle<T>): T {
		if (
			handle$ instanceof PlainComputed ||
			(handle$ instanceof PlainCell && handle$.owner === this)
		)
			return handle$.get();
		throw new TypeError(formatClientError(138));
	}
	set<T>(handle$: WritableSignal<T>, value: T | ((previous: T) => T)): void {
		if (handle$ instanceof PlainCell && handle$.owner === this) return handle$.set(value);
		throw new TypeError(formatClientError(138));
	}
	dispose(): void {
		if (this.disposed) return;
		assertWritable();
		signalBatch(() => {
			this.stopEffectsAndRetire();
			retireGraph(this, []);
		});
	}
}

let installed = false;
export function createKeylessScope(options: { readonly scopeKey: string }): KeylessScope {
	if (!installed) {
		installScopeOperations(KeylessScopeImpl.prototype);
		installed = true;
	}
	return new KeylessScopeImpl(options?.scopeKey);
}
