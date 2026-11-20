import { formatClientError } from '../error-codes.client.generated.js';
import { ScopeLifetime, type KeylessScope } from './keyless-scope.js';
import {
	EffectNode,
	PlainCell,
	PlainComputed,
	addEffect,
	assertAlive,
	assertWritable,
	effectRing,
	leanSource,
	retireKeyless,
	setWatched,
	signalBatch,
	stopEffect,
	untrack,
	watchedHook,
} from './graph.js';
import { NATIVE_DOM_VALUE } from './read-protocol.js';
import {
	SIGNAL_BINDING_READ,
	SIGNAL_BINDING_RETIRED,
	SIGNAL_BINDING_SUBSCRIBE,
	type FamilyOptions,
	type SignalFamily,
	type SignalHandle,
} from './types.js';

// Everything a family needs lives here, so applications that never call
// createFamily ship none of it: the graph exports it uses are otherwise unused,
// and the scope learns of a family only through an entry in its effect ring.

type Member = PlainCell | PlainComputed;

interface IdleEntry {
	readonly family: Family<any, any>;
	readonly id: unknown;
	/** Whether something observes the member, as its `watched` hook counts observers. */
	observed: boolean;
	/** When the member last lost its last observer, or was created without one. */
	releasedAt: number;
	timer: ReturnType<typeof setTimeout> | undefined;
}

// Membership prevents a handle from joining twice. Only idle eviction needs timing state.
const entries = new WeakMap<Member, IdleEntry | null>();

function schedule(member: Member, entry: IdleEntry, delay: number): void {
	const timer = setTimeout(() => {
		entry.timer = undefined;
		if (entry.observed) return;
		const left = entry.releasedAt + entry.family.idle - Date.now();
		if (left > 0) schedule(member, entry, left);
		else entry.family.evict(entry.id);
	}, delay);
	// A server process need not stay up to evict members nothing reads.
	(timer as { unref?: () => void }).unref?.();
	entry.timer = timer;
}

/** Idle members wait out their time once unobserved, unless an observer comes back. */
function watchIdle(member: Member, entry: IdleEntry): void {
	const own = watchedHook(member);
	setWatched(member, () => {
		entry.observed = true;
		let stop: void | (() => void);
		// The member's own hook fails alone, reported as the graph reports hooks, so
		// the family's observation still ends when its last observer leaves.
		try {
			stop = own?.();
		} catch (error) {
			const report = (globalThis as { reportError?: (error: unknown) => void }).reportError;
			if (typeof report === 'function') report(error);
			else console.error(error);
		}
		return () => {
			entry.observed = false;
			// Retirement ends the observation too, after the member has left the family.
			if (entries.get(member) === entry) {
				entry.releasedAt = Date.now();
				if (entry.timer === undefined) schedule(member, entry, entry.family.idle);
			}
			if (typeof stop === 'function') stop();
		};
	});
}

/**
 * What a retired derived member answers, as a retired cell's owner answers for
 * it: every read and subscription throws its getter's ScopeDisposedError, and
 * renderer bindings see that it retired.
 */
let retiredComputed: object | undefined;

function retireComputed(member: PlainComputed): void {
	if (retiredComputed === undefined) {
		const proto: Record<PropertyKey, unknown> = Object.create(PlainComputed.prototype);
		const throws = function (this: PlainComputed) {
			return this.getter();
		};
		for (const name of [
			'get',
			'latest',
			'snapshot',
			'subscribe',
			SIGNAL_BINDING_READ,
			SIGNAL_BINDING_SUBSCRIBE,
			NATIVE_DOM_VALUE,
		])
			proto[name] = throws;
		proto[SIGNAL_BINDING_RETIRED] = () => true;
		retiredComputed = proto;
	}
	Object.setPrototypeOf(member, retiredComputed);
	// A render that read it holds this source, and asks it whether it retired.
	const source = leanSource(member);
	if (source !== undefined)
		Object.assign(source, { subscribe: () => member.getter(), retired: () => true });
}

class Family<K, H extends SignalHandle<unknown>> implements SignalFamily<K, H> {
	readonly members = new Map<unknown, Member>();
	/** Evicted cells move here, a retired owner of the same shape as the scope. */
	private retired: ScopeLifetime | undefined = undefined;
	/** The scope's hold on this family while it has members; see `guard`. */
	private guardEffect: EffectNode | undefined = undefined;

	constructor(
		readonly scope: ScopeLifetime,
		private readonly create: (key: K) => H,
		private readonly keyOf: ((key: K) => unknown) | undefined,
		readonly idle: number,
	) {}

	get size(): number {
		return this.members.size;
	}

	get(key: K): H {
		const scope = this.scope;
		assertAlive(scope);
		const id = this.keyOf ? this.keyOf(key) : key;
		let member = this.members.get(id);
		if (member !== undefined) return member as unknown as H;
		member = untrack(() => this.create(key)) as unknown as Member;
		if (
			!(
				(member instanceof PlainComputed && Object.getPrototypeOf(member) !== retiredComputed) ||
				(member instanceof PlainCell && member.owner === scope)
			) ||
			entries.has(member) ||
			member.subs !== undefined
		)
			throw new TypeError(formatClientError(371));
		const entry =
			this.idle < 0
				? null
				: {
						family: this,
						id,
						observed: false,
						releasedAt: Date.now(),
						timer: undefined,
					};
		entries.set(member, entry);
		this.members.set(id, member);
		if (this.members.size === 1) this.guard();
		if (entry) {
			watchIdle(member, entry);
			schedule(member, entry, this.idle);
		}
		return member as unknown as H;
	}

	has(key: K): boolean {
		return this.members.has(this.keyOf ? this.keyOf(key) : key);
	}

	delete(key: K): boolean {
		return this.evict(this.keyOf ? this.keyOf(key) : key);
	}

	evict(id: unknown): boolean {
		const member = this.members.get(id);
		if (member === undefined) return false;
		assertWritable();
		this.members.delete(id);
		if (this.members.size === 0) this.unguard();
		signalBatch(() => this.retire(member));
		return true;
	}

	clear(): void {
		if (this.members.size === 0) return;
		assertWritable();
		const members = [...this.members.values()];
		this.members.clear();
		this.unguard();
		signalBatch(() => {
			for (const member of members) this.retire(member);
		});
	}

	/**
	 * While it has members, the family sits in its scope's effect ring as an
	 * effect that never runs, so the scope holds it only then. Disposal stops
	 * the ring's effects in order; this one goes back to the end until every
	 * running effect has stopped, so their cleanups still read live members,
	 * and then retires the family's members before the scope retires.
	 */
	private guard(): void {
		const ring = (this.scope.effects ??= effectRing());
		const effect = (this.guardEffect = new EffectNode(undefined));
		effect.cleanup = () => {
			for (let next = ring.next!; next !== ring; next = next.next!)
				if (next.run !== undefined) return this.guard();
			this.clear();
		};
		addEffect(ring, effect);
	}

	private unguard(): void {
		const effect = this.guardEffect;
		if (effect === undefined) return;
		this.guardEffect = undefined;
		effect.cleanup = undefined;
		stopEffect(effect);
	}

	private retire(member: Member): void {
		const timer = entries.get(member)?.timer;
		if (timer !== undefined) clearTimeout(timer);
		entries.delete(member);
		let retired = this.retired;
		if (retired === undefined) {
			retired = this.retired = new ScopeLifetime(this.scope.scopeKey);
			retired.disposed = true;
		}
		retireKeyless(member, retired, this.scope.scopeKey);
		if (member instanceof PlainComputed) retireComputed(member);
	}
}

/**
 * A scope-owned family of keyless signals, one per logical key, created on
 * first `get` by `create`. Members take no room in the scope's key table.
 * Eviction, by `delete`, `clear`, the `idle` policy or the scope's disposal,
 * retires a member: reading it throws ScopeDisposedError, and a later `get`
 * of its key creates a new member.
 */
export function createFamily<K, H extends SignalHandle<unknown>>(
	scope: KeylessScope,
	create: (key: K) => H,
	options?: FamilyOptions<K>,
): SignalFamily<K, H> {
	const keyOf = options?.keyOf;
	const idle = options?.idle ?? -1;
	if (
		!(scope instanceof ScopeLifetime) ||
		typeof create !== 'function' ||
		(options !== undefined && (options === null || typeof options !== 'object')) ||
		(keyOf !== undefined && typeof keyOf !== 'function') ||
		(options?.idle !== undefined && !(typeof idle === 'number' && idle >= 0 && idle < Infinity))
	)
		throw new TypeError(formatClientError(370));
	assertAlive(scope);
	return new Family(scope, create, keyOf, idle);
}
