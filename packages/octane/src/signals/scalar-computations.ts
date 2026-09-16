import { createDerivedCellWith, type DerivedBindingLifecycle, type ScopeImpl } from './engine.js';
import {
	CandidateUnsupportedError,
	derivedValueState,
	errorState,
	invalidateNode,
	isThenable,
	pendingState,
	refreshNode,
	type ScopedNode,
} from './graph.js';
import type { DerivedCompute, DerivedSignal, Scope } from './types.js';

/**
 * The compiler selects this only for a zero-context callback whose result is
 * provably primitive, or whose author asserts sync:true. Shared graph evaluation
 * still owns dependency tracking, thrown suspension/errors and value retention.
 * Do not infer this path from function.length: zero-argument callbacks may return
 * a scalar, Promise or AsyncIterable on different evaluations.
 */
class ScalarBinding<T> implements DerivedBindingLifecycle {
	private frozen = false;
	private compute: DerivedCompute<T> | undefined;

	constructor(
		private readonly owner: ScopeImpl,
		private readonly node: ScopedNode<T>,
		compute: DerivedCompute<T>,
	) {
		this.compute = compute;
		node.compute = (target) => {
			if (owner.readBarrier !== undefined) {
				this.frozen = true;
				return target.state?.snapshot.status === 'ready'
					? target.state
					: pendingState(owner.readBarrier);
			}
			let result: T;
			try {
				result = (this.compute as () => T)();
			} catch (error) {
				// Match general computation errors, including a thrown object whose
				// then accessor itself throws before graph evaluation handles it.
				if (isThenable(error)) throw error;
				return errorState(error);
			}
			// sync:true retains its existing thenable-as-value assertion semantics.
			return derivedValueState(target, result);
		};
	}

	forkCandidate(target: ScopedNode): undefined {
		if (this.frozen || this.owner.readBarrier || !this.compute) {
			throw new CandidateUnsupportedError('Frozen scalar candidates are not supported.');
		}
		target.compute = this.node.compute;
	}

	suspend(): boolean {
		// There is no in-flight producer to cancel. A read during the barrier
		// freezes this binding in node.compute and resume makes that read live.
		return false;
	}

	resume(): void {
		if (!this.frozen || this.owner.retired || this.owner.readBarrier !== undefined || !this.compute)
			return;
		this.frozen = false;
		invalidateNode(this.node);
		refreshNode(this.node);
	}

	dispose(): void {
		this.compute = undefined;
	}
}

export function createDeclaredScalarCell<T>(
	owner: Scope,
	key: string,
	compute: DerivedCompute<T>,
): DerivedSignal<T> {
	return createDerivedCellWith(owner, key, compute, undefined, ScalarBinding);
}
