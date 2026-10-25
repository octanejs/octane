import { formatClientError } from '../error-codes.client.generated.js';
import { createDerivedCellWith, type DerivedBindingLifecycle, type ScopeImpl } from './engine.js';
import {
	CandidateUnsupportedError,
	createDeclarationView,
	derivedResult,
	errorState,
	invalidateNode,
	linkReads,
	pendingState,
	promoteDeclarationView,
	readsDuring,
	readsMatch,
	reevaluateNode,
	refreshNode,
	releaseDeclarationView,
	signalBatch,
	untrack,
	type ScopedNode,
} from './graph.js';
import { isThenable } from './handle-protocol.js';
import { RedeclarableBinding } from './redeclaration.js';
import type { DerivedCompute, DerivedSignal, OwnerScope } from './types.js';

/**
 * The compiler selects this only for a zero-context callback whose result is
 * provably primitive, or whose author asserts sync:true. Shared graph evaluation
 * still owns dependency tracking, thrown suspension/errors and value retention.
 * Do not infer this path from function.length: zero-argument callbacks may return
 * a scalar, Promise or AsyncIterable on different evaluations.
 */
class ScalarBinding<T>
	extends RedeclarableBinding<DerivedCompute<T>>
	implements DerivedBindingLifecycle
{
	// Not private: its declaration views (installScalarViews) use these too.
	frozen = false;
	compute: DerivedCompute<T> | undefined;
	/** A later render's computation, evaluated privately until that render is accepted. */
	declare view?: { readonly node: ScopedNode<T>; readonly binding: ScalarBinding<T> } | undefined;
	/** A render's computation that produced the committed value, and what it read. */
	declare probed?:
		{ readonly compute: DerivedCompute<T>; readonly reads: ScopedNode[] } | undefined;
	/** A view's first value, already computed by the render's probe. */
	declare seeded?: { readonly value: T } | undefined;
	/** Installed with the views; only a binding that has one calls it. */
	declare releaseView: () => void;

	constructor(
		readonly owner: ScopeImpl,
		readonly node: ScopedNode<T>,
		compute: DerivedCompute<T>,
	) {
		super();
		this.compute = compute;
		node.compute = (target) => {
			if (owner.readBarrier !== undefined) {
				this.frozen = true;
				return target.state?.snapshot.status === 'ready'
					? target.state
					: pendingState(owner.readBarrier);
			}
			let result: T;
			const seeded = this.seeded;
			this.seeded = undefined;
			try {
				result = seeded !== undefined ? seeded.value : (this.compute as () => T)();
			} catch (error) {
				// Match general computation errors, including a thrown object whose
				// then accessor itself throws before graph evaluation handles it.
				if (isThenable(error)) throw error;
				return errorState(error);
			}
			// sync:true retains its existing thenable-as-value assertion semantics.
			return derivedResult(target, result);
		};
	}

	protected committedDefinition(): DerivedCompute<T> | undefined {
		return this.compute;
	}

	protected installDefinition(compute: DerivedCompute<T>, sequence: number): void {
		const probed = this.probed;
		this.probed = undefined;
		this.compute = compute;
		this.sequence = sequence;
		// The render already evaluated this computation against the same inputs.
		const unchanged = probed?.compute === compute && readsMatch(this.node, probed.reads);
		// A pending shadow may still cache the superseded declaration's result.
		const shadow = this.node.pending?.shadow;
		if (unchanged && shadow === undefined) return;
		signalBatch(() => {
			if (shadow !== undefined) invalidateNode(shadow);
			if (!unchanged) reevaluateNode(this.node);
		});
	}

	forkCandidate(target: ScopedNode): undefined {
		if (this.frozen || this.owner.readBarrier || !this.compute) {
			throw new CandidateUnsupportedError(formatClientError(205));
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
		this.forgetStaged();
		this.probed = undefined;
		if (this.view) this.releaseView();
		this.compute = undefined;
	}
}

export function createDeclaredScalarCell<T>(
	owner: OwnerScope,
	key: string,
	compute: DerivedCompute<T>,
	sequence?: number,
	captures?: readonly unknown[],
	declaring?: number,
): DerivedSignal<T> {
	return createDerivedCellWith(
		owner,
		key,
		compute,
		undefined,
		ScalarBinding,
		sequence,
		captures,
		declaring,
	);
}

/** See installDerivedViews: compiled instance declarations install these. */
export function installScalarViews(): void {
	const prototype = ScalarBinding.prototype;
	prototype.presentDefinition = presentScalarView;
	prototype.acceptView = acceptScalarView;
	prototype.releaseView = releaseScalarView;
}

/** An equal value needs no view; a changed one is evaluated once, privately. */
function presentScalarView<T>(
	this: ScalarBinding<T>,
	compute: DerivedCompute<T>,
): ScopedNode | undefined {
	// A frozen document keeps presenting committed values. The new closure is
	// installed at acceptance and evaluated when reads resume.
	if (this.frozen || this.owner.readBarrier !== undefined) return undefined;
	let probe: { value: T; reads: ScopedNode[] } | undefined;
	try {
		probe = readsDuring(this.owner, () => (compute as () => T)());
	} catch {
		// A suspended or failing computation reports itself through a view.
	}
	if (probe !== undefined) {
		const state = untrack(() => refreshNode(this.node));
		if (state.snapshot.status === 'ready' && Object.is(state.snapshot.value, probe.value)) {
			this.probed = { compute, reads: probe.reads };
			return undefined;
		}
	}
	if (this.view) this.releaseView();
	const node: ScopedNode<T> = createDeclarationView(this.node, (target) =>
		binding.forkCandidate(target),
	);
	const binding: ScalarBinding<T> = new ScalarBinding(this.owner, node, compute);
	this.view = { node, binding };
	if (probe !== undefined) {
		binding.seeded = { value: probe.value };
		refreshNode(node);
		linkReads(node, probe.reads);
	}
	return node;
}

function acceptScalarView<T>(this: ScalarBinding<T>, node: ScopedNode, sequence: number): void {
	const view = this.view;
	if (view?.node !== node) return;
	this.view = undefined;
	this.compute = view.binding.compute;
	this.sequence = sequence;
	signalBatch(() => {
		const shadow = this.node.pending?.shadow;
		if (shadow !== undefined) invalidateNode(shadow);
		promoteDeclarationView(node, this.node);
	});
	view.binding.dispose();
}

function releaseScalarView(this: ScalarBinding<unknown>): void {
	const view = this.view!;
	this.view = undefined;
	signalBatch(() => releaseDeclarationView(view.node));
	view.binding.dispose();
}
