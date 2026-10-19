import { formatClientError } from '../error-codes.client.generated.js';
import type { DerivedBinding } from './computations.js';
import type { CandidateProducer, ScopedNode } from './graph.js';
import type { ResourceBinding } from './requests.js';
import {
	candidateHooks,
	CandidateUnsupportedError,
	graphBridge as bridge,
	type CandidateContext,
} from './transition-state.js';

/**
 * A node pending in a transition forks its resource or general derived binding
 * into a private candidate through these producers. Only pending state calls
 * them, so they travel with it (see action-capability.ts): requests.ts and
 * computations.ts install them when they create such a cell
 * (`#octane/signal-actions/bindings`), or an `octane-islands` renderer installs
 * both. Binding modules are imported only as types, so a renderer bundle never
 * reaches the signal engine through this one.
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
	// A candidate may publish only over the selection it was forked from.
	const authority = this.selectionAuthority;
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
				if (
					attempt &&
					snapshot.status !== 'pending' &&
					(entry.request.definition.kind !== 'stream' || snapshot.status !== 'ready')
				)
					return { status: 'pending', waiting: target.state?.waiting ?? attempt.settled };
				if (!(
					(snapshot.status === 'ready' &&
						(snapshot.complete || entry.request.definition.kind === 'stream')) ||
					snapshot.status === 'error' ||
					(snapshot.status === 'pending' && attempt)
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
						this.adoptSelection(fork);
						this.selectionAuthority = fork.selectionAuthority;
						return () => {
							if (resolve !== this.resolvePending) resolve?.();
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
	context: CandidateContext,
): CandidateProducer {
	const Binding = this.constructor as typeof DerivedBinding<T>;
	if (this.frozen || this.owner.readBarrier || !this.compute) {
		throw new CandidateUnsupportedError(formatClientError(110));
	}
	const fork = new Binding(this.owner, target, this.compute, this.options);
	fork.candidate = context;
	return {
		dispose: () => fork.dispose(),
		dependencies: () => fork.current?.dependencies.keys() ?? [],
		prepare: () => {
			const state = target.state;
			const current = fork.current;
			// A caught error is an authoritative presentation, just like a ready
			// value. A presented pending result needs a live attempt or graph wakeup.
			if (
				state?.snapshot.status !== 'ready' &&
				state?.snapshot.status !== 'error' &&
				!(state?.snapshot.status === 'pending' && (current || target.wakeup))
			)
				return state?.waiting
					? { status: 'pending', waiting: state.waiting }
					: { status: 'invalid' };
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
						this.adoptAttempt(fork);
						fork.candidate = undefined;
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
							dependency.node = context.canonical(dependency.node);
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
