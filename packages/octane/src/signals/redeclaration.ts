import type { ScopedNode } from './graph.js';
import { currentSignalDeclarationStage, type SignalDeclarationStage } from './read-protocol.js';
import { activeCandidate } from './transition-state.js';

/** One render's redeclaration, applied only when the renderer accepts that render. */
interface StagedDeclaration<D> {
	readonly stage: SignalDeclarationStage;
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

	/** Record the declaration that created this cell. */
	declared(sequence: number): void {
		this.sequence = sequence;
	}

	redeclare(definition: D, sequence: number): ScopedNode {
		// A stale handler or an earlier render's handle presents the committed cell.
		if (sequence <= this.sequence || definition === this.committedDefinition()) return this.node;
		const staged = this.staged;
		const stage = currentSignalDeclarationStage();
		if (stage === undefined) {
			// Work belonging to a render still awaiting acceptance reads its view.
			if (staged !== undefined && sequence >= staged.sequence) return staged.view ?? this.node;
			// A candidate frame must not mutate committed state; a later render rebinds.
			if (activeCandidate !== undefined) return this.node;
			this.installDefinition(definition, sequence);
			return this.node;
		}
		// The first declaration in one render wins; an aliasing second one shares it.
		if (staged?.stage === stage)
			return sequence >= staged.sequence ? (staged.view ?? this.node) : this.node;
		const view = this.presentDefinition(definition);
		const next: StagedDeclaration<D> = { stage, sequence, definition, view };
		this.staged = next;
		stage.settle((discarded) => {
			// A later render owns the definition now, or the cell has retired.
			if (this.staged !== next) return;
			this.staged = undefined;
			if (this.owner.retired) return;
			if (discarded) {
				this.discardDefinition();
				return;
			}
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
