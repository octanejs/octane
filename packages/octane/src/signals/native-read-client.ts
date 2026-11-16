import { formatClientError } from '../error-codes.client.generated.js';
import type { Block, Scope } from '../runtime.js';
import {
	createNativeReadCollector,
	validateNativeReadWitness,
	type NativeReadWitness,
} from './native-read-collector.js';
import {
	NATIVE_TRANSITION_CONSUMER,
	setSignalDeclarationInvocation,
	type NativeTransitionNotify,
	type NativeReadRelease,
	type NativeReadSource,
} from './read-protocol.js';
import { inspectNativeReadWitness } from './native-read-inspection.js';

declare const __OCTANE_PROFILE_ENABLED__: boolean;

interface NativeReadHost {
	capture(): object | null;
	cleanup(scope: Scope, dispose: () => void): void;
	schedule(block: Block): void;
	/** Reuse current ref manifests after a superseding root commits. */
	replayRefs(capture: object, owner: PublicationOwner): boolean;
	refDisposed(entry: object): boolean;
	/** Failed reads may outlive a discarded mount while its existing owner retries. */
	suspended(block: Block, reads: NativeReadWitness): void;
}

interface Subscription {
	leases: number;
	dispose: () => void;
}

interface Consumer {
	scope: Scope;
	block: Block;
	disposed: boolean;
	notify: () => void;
	subscriptions: Map<NativeReadSource, Subscription>;
	committed: Candidate | null;
	/** Its unsettled attempts, newest first, linked by `next`. */
	pending: Candidate | null;
}

/** Lets a release find the consumer behind a subscription (rebaseNativeRead). */
const CONSUMER: unique symbol = Symbol();
type ConsumerNotify = NativeTransitionNotify & { [CONSUMER]?: Consumer };

interface Candidate extends NativeReadWitness {
	consumer: Consumer;
	reads: Map<NativeReadSource, number>;
	mixed: boolean;
	active: boolean;
	/**
	 * The consumer's committed candidate while this pending one has read only
	 * what it read. Its leases keep those sources subscribed, so this one holds
	 * none of its own until it reads something else or the committed one changes.
	 */
	base: Candidate | null;
	/** How many of the base's sources this candidate has yet to read. */
	left: number;
	/** The consumer's pending attempt before this one. */
	next: Candidate | null;
	/** The capture's candidates this one waits in, and its place there. */
	set: CandidateSet | null;
	index: number;
}

interface RenderFrame {
	block: Block | null;
	collectorToken: number;
	/** The first candidate of this invocation, usually its only one. */
	candidate: Candidate | null;
	/** The candidates of any further Scopes. */
	candidates: Map<Scope, Candidate> | null;
	/** Renderer data scoped to this one invocation, such as a declaration stage. */
	invocationData: unknown;
	/** This invocation's declaration number; nested invocations have larger ones. */
	invocation: number;
	/** The renderer capture this invocation renders into, which a nested one may replace. */
	capture: object | null;
	/** The declaration invocation this one interrupted, restored when it ends. */
	outerInvocation: number;
}

type CandidateSet = Candidate[];

function noop(): void {}

/** Give a candidate that relied on the committed leases its own. */
function lease(candidate: Candidate): void {
	const subscriptions = candidate.consumer.subscriptions;
	for (const source of candidate.reads.keys()) subscriptions.get(source)!.leases++;
	// Last: an exhausted native stack then leaves a lease too many, never one too few.
	candidate.base = null;
}

/** Before the committed candidate changes, the attempts relying on its leases take their own. */
function leasePending(consumer: Consumer): void {
	for (let candidate = consumer.pending; candidate !== null; candidate = candidate.next)
		if (candidate.base !== null) lease(candidate);
}

function unlink(consumer: Consumer, candidate: Candidate): void {
	let previous: Candidate | null = null;
	for (let pending = consumer.pending; pending !== null; pending = pending.next) {
		if (pending === candidate) {
			if (previous === null) consumer.pending = candidate.next;
			else previous.next = candidate.next;
			candidate.next = null;
			return;
		}
		previous = pending;
	}
}

/**
 * Hydration registers this as the NativeReadRebase. A consumer whose committed
 * render alone holds a released historical read moves it to the unchanged live
 * successor, as if the render had read it live, and is not rendered again. A
 * pending attempt that shares the lease revalidates and renders instead.
 */
export function rebaseNativeRead(notify: () => void, release: NativeReadRelease): boolean {
	const consumer = (notify as ConsumerNotify)[CONSUMER];
	if (consumer === undefined) return false;
	const { historical } = release;
	const committed = consumer.committed;
	leasePending(consumer);
	const subscription = consumer.subscriptions.get(historical);
	if (
		committed === null ||
		consumer.block.disposed ||
		subscription?.leases !== 1 ||
		!committed.reads.has(historical)
	)
		return false;
	let successor: ReturnType<NativeReadRelease['successor']>;
	try {
		successor = release.successor();
	} catch {
		// The consumer's own render reports whatever this read now throws.
		return false;
	}
	if (successor === undefined) return false;
	const { live, version } = successor;
	if (!release.binding && !committed.reads.has(live)) {
		committed.reads.set(live, version);
		let current = consumer.subscriptions.get(live);
		if (current === undefined) {
			current = { leases: 0, dispose: live.subscribe(consumer.notify) };
			consumer.subscriptions.set(live, current);
		}
		current.leases++;
	}
	committed.reads.delete(historical);
	consumer.subscriptions.delete(historical);
	subscription.dispose();
	return true;
}

interface PublicationOwner {
	generation: number;
	disposed: boolean;
}

interface Publication {
	owner: PublicationOwner;
	generation: number;
}

interface UnpublishedRef {
	owner: PublicationOwner;
	entry: object;
	ref: unknown;
}

/**
 * The native adapter owns no DOM queue or parent/child tree. Renderer Scopes
 * own consumers, real Blocks schedule them, and existing captures own each
 * speculative read set until the renderer accepts or discards that attempt.
 */
export function createNativeReadDriver(host: NativeReadHost) {
	const consumers = new WeakMap<Scope, Consumer>();
	const captures = new WeakMap<object, CandidateSet>();
	const frames: RenderFrame[] = [];
	let depth = 0;
	let invocations = 0;
	let publications: WeakMap<object, Publication> | null = null;
	let ownerPublications: WeakMap<PublicationOwner, Publication> | null = null;
	let unpublishedRefs: WeakMap<object, UnpublishedRef> | null = null;
	let deferredRefs: WeakMap<PublicationOwner, Map<object, object>> | null = null;

	function forgetUnpublishedRef(target: object): void {
		const unpublished = unpublishedRefs?.get(target);
		if (unpublished === undefined) return;
		unpublishedRefs!.delete(target);
		const pending = deferredRefs?.get(unpublished.owner);
		pending?.delete(target);
		if (pending?.size === 0) deferredRefs!.delete(unpublished.owner);
	}

	function release(candidate: Candidate): void {
		if (!candidate.active) return;
		const consumer = candidate.consumer;
		// First: an exhausted native stack then leaves it as it was, still releasable.
		unlink(consumer, candidate);
		candidate.active = false;
		if (candidate.base === null) {
			for (const source of candidate.reads.keys()) {
				const subscription = consumer.subscriptions.get(source);
				if (subscription !== undefined && --subscription.leases === 0) {
					// Forget it only once stopped: an exhausted native stack can interrupt
					// the stop, and disposeConsumer then finishes it.
					subscription.dispose();
					consumer.subscriptions.delete(source);
				}
			}
		} else candidate.base = null;
		candidate.reads.clear();
	}

	function disposeConsumer(consumer: Consumer): void {
		if (consumer.disposed) return;
		consumer.disposed = true;
		if (consumer.committed !== null) release(consumer.committed);
		consumer.committed = null;
		for (let candidate = consumer.pending; candidate !== null;) {
			const next = candidate.next;
			release(candidate);
			candidate = next;
		}
		consumer.pending = null;
		// Only a release the native stack interrupted leaves one behind.
		for (const subscription of consumer.subscriptions.values()) subscription.dispose();
		consumer.subscriptions.clear();
		// The WeakMap entry does not keep the Scope alive. Deleting it also makes
		// an accidental later read unable to recover a retired consumer.
		consumers.delete(consumer.scope);
	}

	function getConsumer(scope: Scope, block: Block): Consumer {
		let consumer = consumers.get(scope);
		if (consumer === undefined) {
			consumer = {
				scope,
				block,
				disposed: false,
				notify: () => {
					if (!consumer!.disposed && !consumer!.block.disposed) host.schedule(consumer!.block);
				},
				subscriptions: new Map(),
				committed: null,
				pending: null,
			};
			consumers.set(scope, consumer);
			const owned = consumer;
			const notify = owned.notify as ConsumerNotify;
			notify[CONSUMER] = owned;
			// A transition that writes what this consumer reads renders its Block.
			notify[NATIVE_TRANSITION_CONSUMER] = block;
			host.cleanup(scope, () => disposeConsumer(owned));
		}
		return consumer;
	}

	function attempt(consumer: Consumer): Candidate {
		const base = consumer.committed;
		const candidate: Candidate = {
			consumer,
			reads: new Map(),
			mixed: false,
			active: true,
			base,
			left: base === null ? 0 : base.reads.size,
			next: consumer.pending,
			set: null,
			index: 0,
		};
		return (consumer.pending = candidate);
	}

	function getCandidate(frame: RenderFrame, scope: Scope): Candidate {
		const first = frame.candidate;
		if (first === null) return (frame.candidate = attempt(getConsumer(scope, frame.block!)));
		if (first.consumer.scope === scope) return first;
		let candidate = frame.candidates?.get(scope);
		if (candidate === undefined) {
			candidate = attempt(getConsumer(scope, frame.block!));
			(frame.candidates ??= new Map()).set(scope, candidate);
		}
		return candidate;
	}

	const collector = createNativeReadCollector((owner, source, version) => {
		const frame = frames[depth - 1];
		if (frame === undefined || frame.block === null) return;
		const candidate = getCandidate(frame, owner as Scope);
		const previous = candidate.reads.get(source);
		if (previous !== undefined) {
			// Keep the first revision: replacing it would make mixed output appear
			// valid merely because its last read happened after an invalidation.
			if (previous !== version) candidate.mixed = true;
			return;
		}
		const base = candidate.base;
		if (base !== null) {
			if (base.reads.has(source)) {
				candidate.reads.set(source, version);
				candidate.left--;
				return;
			}
			lease(candidate);
		}
		candidate.reads.set(source, version);
		const consumer = candidate.consumer;
		const subscription = consumer.subscriptions.get(source);
		if (subscription === undefined) {
			// Record the lease before subscribing, so a release always finds what
			// an exhausted native stack left, never an observer it cannot stop.
			const leased = { leases: 1, dispose: noop };
			consumer.subscriptions.set(source, leased);
			leased.dispose = source.subscribe(consumer.notify);
		} else subscription.leases++;
	});

	function put(target: CandidateSet, candidate: Candidate): void {
		let index = target.length;
		// A set holds one attempt per consumer: this one takes an earlier one's place.
		for (let other = candidate.consumer.pending; other !== null; other = other.next) {
			if (other !== candidate && other.set === target) {
				index = other.index;
				release(other);
				break;
			}
		}
		candidate.set = target;
		candidate.index = index;
		target[index] = candidate;
	}

	function target(capture: object): CandidateSet {
		let candidates = captures.get(capture);
		if (candidates === undefined) captures.set(capture, (candidates = []));
		return candidates;
	}

	function fail(block: Block, candidate: Candidate, suspended: boolean): void {
		if (suspended && candidate.active) host.suspended(block, candidate);
		release(candidate);
	}

	function validate(candidates: CandidateSet | undefined): boolean {
		if (candidates !== undefined) {
			for (let index = 0; index < candidates.length; index++) {
				const candidate = candidates[index];
				if (
					candidate.active &&
					!candidate.consumer.disposed &&
					!validateNativeReadWitness(candidate)
				)
					return false;
			}
		}
		return true;
	}

	function accept(candidates: CandidateSet): void {
		for (let index = 0; index < candidates.length; index++) {
			const candidate = candidates[index];
			const consumer = candidate.consumer;
			if (!candidate.active || consumer.disposed) continue;
			// A committed candidate must not keep its whole capture's attempts alive.
			candidate.set = null;
			const previous = consumer.committed;
			unlink(consumer, candidate);
			leasePending(consumer);
			consumer.committed = candidate;
			if (candidate.base !== null) {
				// It read every committed source and no other, so the committed leases
				// become its own and the outgoing candidate is simply dropped.
				if (candidate.left === 0) {
					candidate.base = null;
					continue;
				}
				lease(candidate);
			}
			if (previous !== null) release(previous);
		}
	}

	return {
		/** DevTools only: selected-node inspection reads this Scope's existing records only. */
		inspectScope:
			typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__
				? (scope: Scope) => {
						const consumer = consumers.get(scope);
						if (consumer === undefined || consumer.disposed) return null;
						const pending = [];
						for (let candidate = consumer.pending; candidate !== null; candidate = candidate.next)
							pending.unshift(inspectNativeReadWitness(candidate));
						return {
							block: consumer.block,
							committed:
								consumer.committed === null ? null : inspectNativeReadWitness(consumer.committed),
							pending,
						};
					}
				: undefined,
		/** Receipt stamps exist only for a capture that actually read native data. */
		stampPublication(owner: PublicationOwner, queues: readonly (readonly object[])[]): void {
			const publication: Publication = { owner, generation: owner.generation };
			(ownerPublications ??= new WeakMap()).set(owner, publication);
			const receipts = (publications ??= new WeakMap());
			for (const queue of queues) for (const entry of queue) receipts.set(entry, publication);
		},
		hasPublication(owner: PublicationOwner): boolean {
			return ownerPublications?.has(owner) === true;
		},
		/** Reveals enumerate current refs after their candidate was already accepted. */
		stampQueuedPublication(owner: PublicationOwner, entry: object): void {
			const publication = ownerPublications?.get(owner);
			if (publication !== undefined) publications!.set(entry, publication);
		},
		publicationCurrent(entry: object): boolean {
			const publication = publications?.get(entry);
			return (
				publication === undefined ||
				(!publication.owner.disposed && publication.owner.generation === publication.generation)
			);
		},
		deferRef(entry: object, target: object, ref: unknown): void {
			const publication = publications?.get(entry);
			if (publication === undefined || publication.owner.disposed) return;
			forgetUnpublishedRef(target);
			const owner = publication.owner;
			(unpublishedRefs ??= new WeakMap()).set(target, { owner, entry, ref });
			const owners = (deferredRefs ??= new WeakMap());
			let pending = owners.get(owner);
			if (pending === undefined) owners.set(owner, (pending = new Map()));
			pending.set(target, entry);
		},
		unpublishedRef(target: object, ref: unknown): boolean {
			const unpublished = unpublishedRefs?.get(target);
			return unpublished !== undefined && unpublished.ref === ref;
		},
		forgetUnpublishedRef,
		deferredRefEntries(owner: PublicationOwner): ReadonlyMap<object, object> | undefined {
			return deferredRefs?.get(owner);
		},
		clearDeferredRefs(owner: PublicationOwner): void {
			ownerPublications?.delete(owner);
			const pending = deferredRefs?.get(owner);
			if (pending === undefined) return;
			for (const target of pending.keys()) forgetUnpublishedRef(target);
		},
		pruneDeferredRefs(owner: PublicationOwner): void {
			const pending = deferredRefs?.get(owner);
			if (pending === undefined) return;
			for (const [target, entry] of pending) {
				if (host.refDisposed(entry)) forgetUnpublishedRef(target);
			}
		},
		replayDeferredRefs: host.replayRefs,
		beginRender(block: Block): void {
			// Any call here can exhaust the native stack, and the renderer then ends
			// whatever was published. Publish only state endRender can restore: the
			// invocation is already entered, and the collector token stays -1 until
			// the collector has entered too.
			const outerInvocation = setSignalDeclarationInvocation(++invocations);
			const frame = (frames[depth++] ??= {
				block: null,
				collectorToken: -1,
				candidate: null,
				candidates: null,
				invocationData: null,
				invocation: 0,
				capture: null,
				outerInvocation: 0,
			});
			frame.block = block;
			frame.collectorToken = -1;
			frame.candidate = null;
			frame.candidates = null;
			frame.invocationData = null;
			frame.invocation = invocations;
			frame.outerInvocation = outerInvocation;
			frame.collectorToken = collector.beginRender(block);
			frame.capture = host.capture();
			// Parameters precede compiler body scopes. Start with the actual Block
			// owner, and retire prior reads even when this invocation no longer
			// enters an instrumented body or reads a native source.
			const consumer = consumers.get(block);
			if (consumer !== undefined) frame.candidate = attempt(consumer);
		},
		endRender(block: Block, completed: boolean, suspended: boolean): void {
			// A native stack overflow can stop a descendant's setup or cleanup before
			// it ends its frame, leaving that frame above this Block's own.
			let index = depth - 1;
			while (index >= 0 && frames[index].block !== block) index--;
			// The first native component can install the driver inside a child of
			// an already-running non-native Block. That outer Block has no frame.
			if (index < 0) return;
			const frame = frames[index];
			try {
				// Restoring this frame's collector token and invocation below also
				// restores whatever abandoned frames entered. Only their reads remain.
				for (let above = depth - 1; above > index; above--) {
					const abandoned = frames[above];
					if (abandoned.candidate !== null) release(abandoned.candidate);
					if (abandoned.candidates !== null)
						for (const candidate of abandoned.candidates.values()) release(candidate);
				}
				const first = frame.candidate;
				if (first !== null) {
					const rest = frame.candidates;
					if (completed) {
						const capture = host.capture();
						if (capture === null) throw new Error(formatClientError(167));
						const destination = target(capture);
						put(destination, first);
						if (rest !== null) for (const candidate of rest.values()) put(destination, candidate);
					} else {
						fail(block, first, suspended);
						if (rest !== null)
							for (const candidate of rest.values()) fail(block, candidate, suspended);
					}
				}
			} finally {
				collector.endRender(frame.collectorToken);
				setSignalDeclarationInvocation(frame.outerInvocation);
				while (depth > index) {
					const ended = frames[--depth];
					ended.block = null;
					ended.candidate = null;
					ended.candidates = null;
					ended.invocationData = null;
					// A reused frame must not retain a settled capture's commit work.
					ended.capture = null;
				}
			}
		},
		/**
		 * The current invocation of `block`, or undefined outside its render. A
		 * render-phase rerun is a new invocation; a child render returns to the
		 * parent's frame intact.
		 */
		invocation(block: Block): { invocationData: unknown } | undefined {
			const frame = frames[depth - 1];
			return frame !== undefined && frame.block === block ? frame : undefined;
		},
		/**
		 * The invocation numbered `id` while it is still rendering, such as the
		 * component whose directive arm is rendering now, or undefined once it
		 * has ended. Frames deeper in the stack began later and number higher.
		 */
		enclosingInvocation(
			id: number,
		): { invocationData: unknown; readonly capture: object | null } | undefined {
			for (let index = depth - 1; index >= 0; index--) {
				const frame = frames[index];
				if (frame.invocation <= id)
					return frame.invocation === id && frame.block !== null ? frame : undefined;
			}
			return undefined;
		},
		beginScope(scope: Scope, block: Block): number {
			if (collector.isDetached()) return collector.beginScope(scope);
			if (host.capture() === null) throw new Error(formatClientError(168));
			if (depth === 0 || frames[depth - 1].block !== block) this.beginRender(block);
			const frame = frames[depth - 1];
			// An empty successful render replaces its prior dependencies. A Scope
			// that has never read a native source needs no consumer or read map.
			// The Block's own candidate was already prepared by beginRender.
			if (scope !== block && consumers.has(scope)) getCandidate(frame, scope);
			return collector.beginScope(scope);
		},
		endScope(token: number): void {
			collector.endScope(token);
		},
		pauseLifecycle(): number {
			return collector.suspend(true);
		},
		resumeLifecycle(token: number): void {
			collector.resume(token, true);
		},
		beginWitness: collector.beginWitness,
		finishWitness: collector.finishWitness,
		replay: collector.replay,
		validateCapture(capture: object): boolean {
			return validate(captures.get(capture));
		},
		acceptCapture(capture: object): boolean {
			const candidates = captures.get(capture);
			if (candidates === undefined) return false;
			captures.delete(capture);
			accept(candidates);
			return candidates.length > 0;
		},
		spliceCapture(capture: object, parent: object | null): void {
			const candidates = captures.get(capture);
			if (candidates === undefined) return;
			if (parent === null) throw new Error(formatClientError(169));
			captures.delete(capture);
			const destination = target(parent);
			for (let index = 0; index < candidates.length; index++) put(destination, candidates[index]);
		},
		discardCapture(capture: object): void {
			const candidates = captures.get(capture);
			if (candidates === undefined) return;
			captures.delete(capture);
			for (let index = 0; index < candidates.length; index++) release(candidates[index]);
		},
	};
}

export type NativeReadDriver = ReturnType<typeof createNativeReadDriver>;
