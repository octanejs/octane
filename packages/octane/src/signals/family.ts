import { formatClientError } from '../error-codes.client.generated.js';
import { REACTIVE_FAMILY_MEMBER } from './graph-flags.js';
import { ScopeImpl } from './engine.js';
import {
	PlainCell,
	PlainComputed,
	assertAlive,
	assertWritable,
	retireKeyless,
	setFamilyRelease,
	signalBatch,
	untrack,
} from './graph.js';
import type { FamilyOptions, Scope, SignalFamily, SignalHandle } from './types.js';

type Member = PlainCell | PlainComputed;

/** What a family keeps per member, beside the member itself. */
interface MemberEntry {
	readonly family: Family<any, any>;
	readonly id: unknown;
	/** When the member last lost its last reader, or was created without one. */
	releasedAt: number;
	timer: ReturnType<typeof setTimeout> | undefined;
}

const entries = new WeakMap<Member, MemberEntry>();

/** Idle members wait out their time, then go unless a reader came back meanwhile. */
function release(member: Member): void {
	const entry = entries.get(member)!;
	if (entry.family.idle < 0) return;
	entry.releasedAt = Date.now();
	if (entry.timer === undefined) schedule(member, entry, entry.family.idle);
}

function schedule(member: Member, entry: MemberEntry, delay: number): void {
	const timer = setTimeout(() => {
		entry.timer = undefined;
		if (member.subs !== undefined) return;
		const left = entry.releasedAt + entry.family.idle - Date.now();
		if (left > 0) schedule(member, entry, left);
		else entry.family.evict(entry.id);
	}, delay);
	// A server process need not stay up to evict members nothing reads.
	(timer as { unref?: () => void }).unref?.();
	entry.timer = timer;
}

class Family<K, H extends SignalHandle<unknown>> implements SignalFamily<K, H> {
	readonly members = new Map<unknown, Member>();
	/** Evicted cells move here, a retired owner of the same shape as the scope. */
	private retired: ScopeImpl | undefined = undefined;

	constructor(
		readonly scope: ScopeImpl,
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
				member instanceof PlainComputed ||
				(member instanceof PlainCell && member.owner === scope)
			) ||
			member.flags & REACTIVE_FAMILY_MEMBER
		)
			throw new TypeError(formatClientError(369));
		member.flags |= REACTIVE_FAMILY_MEMBER;
		const entry: MemberEntry = { family: this, id, releasedAt: Date.now(), timer: undefined };
		entries.set(member, entry);
		this.members.set(id, member);
		// The scope holds a family only while it has members to retire.
		if (this.members.size === 1) (scope.families ??= new Set()).add(this);
		if (this.idle >= 0) schedule(member, entry, this.idle);
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
		if (this.members.size === 0) this.scope.families!.delete(this);
		signalBatch(() => this.retire(member));
		return true;
	}

	clear(): void {
		if (this.members.size === 0) return;
		assertWritable();
		const members = [...this.members.values()];
		this.members.clear();
		this.scope.families!.delete(this);
		signalBatch(() => {
			for (const member of members) this.retire(member);
		});
	}

	private retire(member: Member): void {
		const timer = entries.get(member)!.timer;
		if (timer !== undefined) clearTimeout(timer);
		entries.delete(member);
		let retired = this.retired;
		if (retired === undefined) {
			retired = this.retired = new ScopeImpl(this.scope.scopeKey, false, undefined, 0);
			retired.disposed = true;
		}
		retireKeyless(member, retired, this.scope.scopeKey);
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
	scope: Scope,
	create: (key: K) => H,
	options?: FamilyOptions<K>,
): SignalFamily<K, H> {
	const keyOf = options?.keyOf;
	const idle = options?.idle ?? -1;
	if (
		!(scope instanceof ScopeImpl) ||
		typeof create !== 'function' ||
		(options !== undefined && (options === null || typeof options !== 'object')) ||
		(keyOf !== undefined && typeof keyOf !== 'function') ||
		(options?.idle !== undefined && !(typeof idle === 'number' && idle >= 0 && idle < Infinity))
	)
		throw new TypeError(formatClientError(368));
	assertAlive(scope);
	setFamilyRelease(release);
	return new Family(scope, create, keyOf, idle);
}
