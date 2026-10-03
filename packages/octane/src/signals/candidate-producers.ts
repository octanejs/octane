import { formatClientError } from '../error-codes.client.generated.js';
import type { DerivedBinding } from './computations.js';
import type { CandidateProducer, ScopedNode, SignalCandidateFrame } from './graph.js';
import type { ResourceBinding } from './requests.js';
import {
	candidateGraph as bridge,
	candidateHooks,
	CandidateUnsupportedError,
} from './transition-state.js';

/**
 * An Action frame forks a resource or general derived binding into a private
 * candidate through these producers. Only a frame calls them, so they travel
 * with it (see action-capability.ts): requests.ts and computations.ts install
 * them when they create such a cell (`#octane/signal-actions/bindings`), or an
 * `octane-islands` renderer installs both. Binding modules are imported only as
 * types, so a renderer bundle never reaches the signal engine through this one.
 */
export function installResourceCandidates(): void {
	candidateHooks.resource = forkResource;
}

export function installDerivedCandidates(): void {
	candidateHooks.derived = forkDerived;
}

function forkResource<T>(this: ResourceBinding<T>, target: ScopedNode<T>): CandidateProducer {
	if (this.streamedSelection || this.owner.streams?.selections.has(this.node.key)) {
		throw new CandidateUnsupportedError(formatClientError(201));
	}
	const fork = new (this.constructor as typeof ResourceBinding<T>)(
		this.owner,
		target,
		this.describe,
	);
	fork.candidate = true;
	fork.queryDefinition = this.queryDefinition;
	// Retained data belongs to its last successful request, not necessarily
	// the current selection. A different query family must still clear it.
	fork.retainedRequest = this.retainedRequest;
	return {
		dispose: () => fork.dispose(),
		prepare: () => {
			if (this.streamedSelection || this.owner.streams?.selections.has(this.node.key))
				return { status: 'invalid' };
			const entry = fork.selected;
			const attempt = entry?.attempt;
			if (entry) {
				// Receiver-owned channels need their own adoption authority, even
				// when another resource selected this canonical request first.
				if (attempt?.streamed) return { status: 'invalid' };
				const snapshot = entry.state.snapshot;
				if (attempt && (entry.request.definition.kind !== 'stream' || snapshot.status !== 'ready'))
					return { status: 'pending', waiting: target.state?.waiting ?? attempt.settled };
				if (!(
					(snapshot.status === 'ready' &&
						(snapshot.complete || entry.request.definition.kind === 'stream')) ||
					snapshot.status === 'error'
				))
					return { status: 'invalid' };
			} else if (target.state?.snapshot.status !== 'idle') {
				// Only an explicit skip has no selection. A description failure
				// is not a completed request and cannot grant publication authority.
				const state = target.state;
				if (state?.snapshot.status === 'error')
					return { status: 'error', error: state.snapshot.error };
				if (state?.waiting) return { status: 'pending', waiting: state.waiting };
				return { status: 'invalid' };
			}
			const state = entry?.state;
			const authority = this.selectionAuthority;
			const forkAuthority = fork.selectionAuthority;
			return {
				status: 'ready',
				receipt: {
					validate: () =>
						!this.streamedSelection &&
						!this.owner.streams?.selections.has(this.node.key) &&
						this.selectionAuthority === authority &&
						fork.selectionAuthority === forkAuthority &&
						fork.selected === entry &&
						(entry
							? entry.state === state && entry.attempt === attempt && entry.consumers.has(fork)
							: target.state?.snapshot.status === 'idle'),
					publish: () => {
						const previous = this.selected;
						const resolve = this.resolvePending;
						// Install the accepted consumer before releasing either lease. No
						// selector, loader or abort callback executes in this phase.
						entry?.consumers.add(this);
						entry?.consumers.delete(fork);
						this.selected = entry;
						this.selectedIdentity = fork.selectedIdentity;
						this.retainedRequest = fork.retainedRequest;
						this.describedAttempt = fork.describedAttempt;
						this.observedAttempt = fork.observedAttempt;
						this.selectionAuthority = fork.selectionAuthority;
						this.pendingObserver = undefined;
						this.pendingPromise = undefined;
						this.resolvePending = undefined;
						this.seeded = undefined;
						fork.selected = undefined;
						return () => {
							resolve?.();
							// Acceptance or earlier abort cleanup can select the old request
							// again. Its new current lease is not this retired selection.
							if (previous !== entry && previous !== this.selected) previous?.remove(this);
						};
					},
				},
			};
		},
	};
}

function forkDerived<T>(
	this: DerivedBinding<T>,
	target: ScopedNode<T>,
	frame: SignalCandidateFrame,
): CandidateProducer {
	const Binding = this.constructor as typeof DerivedBinding<T>;
	if (this.frozen || this.owner.readBarrier || !this.compute) {
		throw new CandidateUnsupportedError(formatClientError(110));
	}
	const fork = new Binding(this.owner, target, this.compute, this.options);
	fork.candidate = frame;
	return {
		dispose: () => fork.dispose(),
		dependencies: () => fork.current?.dependencies.keys() ?? [],
		prepare: () => {
			const state = target.state;
			// A caught error is an authoritative presentation, just like a ready
			// value. Unhandled reads still report the authored error to the frame.
			if (state?.snapshot.status !== 'ready' && state?.snapshot.status !== 'error')
				return state?.waiting
					? { status: 'pending', waiting: state.waiting }
					: { status: 'invalid' };
			const current = fork.current;
			const previous = this.current;
			return {
				status: 'ready',
				receipt: {
					validate: () =>
						!this.owner.retired &&
						this.owner.readBarrier === undefined &&
						this.compute !== undefined &&
						this.current === previous &&
						fork.current === current &&
						target.state === state &&
						(!current || (current.binding === fork && fork.validDependencies(current))),
					publish: () => {
						// Transfer producer authority without aborting the old attempt or
						// invoking authored code while canonical graph state is installing.
						this.current = current;
						if (current) current.binding = this;
						this.node.invalidateAttempt = current ? () => this.invalidateGraph() : undefined;
						fork.current = undefined;
						fork.candidate = undefined;
						target.invalidateAttempt = undefined;
						return () => {
							if (previous !== this.current) this.stop(previous);
						};
					},
					accept: () => {
						if (!current) return;
						const dependencies = [...current.dependencies.values()];
						const releases: (() => void)[] = [];
						current.dependencies.clear();
						for (const dependency of dependencies) {
							releases.push(dependency.unsubscribe);
							dependency.node = frame.canonical(dependency.node);
							dependency.revision = dependency.node.revision;
							// Canonical states and revisions are installed. Subscribe without
							// refresh/evaluation, and acquire every lease before releasing any.
							dependency.unsubscribe = bridge.attachObserver(
								dependency.node,
								Binding.notify(current),
								true,
							);
							current.dependencies.set(dependency.node, dependency);
						}
						for (const release of releases) release();
					},
				},
			};
		},
	};
}
