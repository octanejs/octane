import type { ScopedNode } from './graph.js';
import {
	currentSignalDeclarationInvocation,
	currentSignalDeclarationStage,
	type SignalDeclarationStage,
} from './read-protocol.js';
import { activeCandidate } from './transition-state.js';

/** One render's redeclaration, applied only when the renderer accepts that render. */
interface StagedDeclaration<D> {
	readonly stage: SignalDeclarationStage;
	/** The render invocation that staged it; see currentSignalDeclarationInvocation. */
	readonly invocation: number;
	readonly sequence: number;
	readonly definition: D;
	/** The render's private view, or undefined when the committed cell presents it. */
	readonly view: ScopedNode | undefined;
}

/**
 * A facade cell whose definition is a closure. A later render may declare the
 * same cell again with closures that capture new render values. That render
 * presents its own definition through a private view; committed state changes
 * only when the renderer accepts the render, so a discarded transition or
 * suspended attempt never exposes its definition to committed readers.
 */
export abstract class RedeclarableBinding<D> {
	/** Declaration order of the committed definition. Older closures never rebind it. */
	protected sequence = 0;
	declare private staged?: StagedDeclaration<D>;
	/** Kept by an attempt that restarted before any render declaring it was accepted. */
	declare private provisional?: boolean;
	/** The render values the committed definition captured, when compiled code listed them. */
	declare private captures?: readonly unknown[];
	/** The last render invocation whose first declaration presented the committed cell. */
	declare private presented?: number;
	abstract readonly node: ScopedNode;
	abstract readonly owner: { readonly retired: boolean };

	/** The committed definition, compared by identity with a redeclaration. */
	protected abstract committedDefinition(): D | undefined;
	/** Install a definition that the committed cell can present itself. */
	protected abstract installDefinition(definition: D, sequence: number): void;
	/** A private view presenting the definition, or undefined if the cell already does. */
	protected abstract presentDefinition(definition: D): ScopedNode | undefined;
	/**
	 * The accepted render presented this view; make it canonical if it is still
	 * current. `definition` is the closure that render declared.
	 */
	protected abstract acceptView(view: ScopedNode, sequence: number, definition: D): void;
	/** The renderer discarded the render that staged this definition. */
	protected discardDefinition(): void {}

	/**
	 * Record the declaration that created this cell, the first in its render.
	 * `declaring` is the invocation that evaluated it; see `redeclare`.
	 */
	declared(sequence: number, captures?: readonly unknown[], declaring = 0): void {
		this.sequence = sequence;
		this.captures = captures;
		this.presented = renderInvocation(currentSignalDeclarationInvocation(), declaring);
	}

	/**
	 * A suspended attempt that never committed restarts with new inputs and keeps
	 * this cell. No committed reader presents it, so until a render declaring it
	 * is accepted, a discarded render's definition replaces the abandoned one.
	 */
	supersede(): void {
		this.provisional = true;
	}

	/**
	 * `captures` lists the render values a compiled closure captured. When each
	 * is unchanged, the closure computes exactly what the committed one does, so
	 * the render presents the committed cell without staging or evaluating it.
	 *
	 * `declaring` is the render invocation that evaluated this declaration, when
	 * the cell belongs to that render's owner. A directive arm or inline row of
	 * that owner only reads the declaration: the owner's render stages it, so an
	 * arm attempt that suspends and is discarded cannot discard a declaration
	 * whose render commits. Without it, the reading render stages it.
	 */
	redeclare(
		definition: D,
		sequence: number,
		captures?: readonly unknown[],
		declaring = 0,
	): ScopedNode {
		// A stale handler or an earlier render's handle presents the committed cell.
		if (sequence <= this.sequence || definition === this.committedDefinition()) return this.node;
		const staged = this.staged;
		// The first declaration in one render wins; an aliasing second one shares
		// it. Equal captures present the committed cell without opening a stage.
		const current = currentSignalDeclarationInvocation();
		const invocation = renderInvocation(current, declaring);
		if (invocation === 0 || staged?.invocation !== invocation) {
			if (sameCaptures(this.captures, captures)) {
				this.presented = invocation;
				return this.node;
			}
			if (invocation !== 0 && this.presented === invocation) return this.node;
		}
		const stage = currentSignalDeclarationStage(invocation === current ? undefined : invocation);
		if (stage === undefined) {
			// Work belonging to a render still awaiting acceptance reads its view.
			if (staged !== undefined && sequence >= staged.sequence) return staged.view ?? this.node;
			// A candidate frame must not mutate committed state; a later render rebinds.
			if (activeCandidate !== undefined) return this.node;
			this.captures = captures;
			this.presented = invocation;
			this.installDefinition(definition, sequence);
			return this.node;
		}
		// The first declaration in one render wins; an aliasing second one shares it.
		if (staged?.stage === stage)
			return sequence >= staged.sequence ? (staged.view ?? this.node) : this.node;
		const view = this.presentDefinition(definition);
		const next: StagedDeclaration<D> = { stage, invocation, sequence, definition, view };
		this.staged = next;
		stage.settle((discarded) => {
			// A later render owns the definition now, or the cell has retired.
			if (this.staged !== next) return;
			this.staged = undefined;
			if (this.owner.retired) return;
			if (discarded && !this.provisional) {
				this.discardDefinition();
				return;
			}
			if (!discarded) this.provisional = false;
			this.captures = captures;
			if (view === undefined) this.installDefinition(definition, sequence);
			else this.acceptView(view, sequence, definition);
		});
		return view ?? this.node;
	}

	/** Retirement forgets an unsettled render's definition. */
	protected forgetStaged(): void {
		this.staged = undefined;
	}
}

/** The render a declaration belongs to, or 0 when no render is reading it. */
function renderInvocation(current: number, declaring: number): number {
	return current === 0 || declaring === 0 ? current : declaring;
}

function sameCaptures(
	committed: readonly unknown[] | undefined,
	captures: readonly unknown[] | undefined,
): boolean {
	if (!committed || !captures || committed.length !== captures.length) return false;
	for (let index = 0; index < captures.length; index++)
		if (!Object.is(committed[index], captures[index])) return false;
	return true;
}
