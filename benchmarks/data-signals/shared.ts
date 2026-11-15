import type { OctaneNode } from 'octane';

/** Counted by every row render. */
export const counts = { renders: 0 };

export interface Slot {
	readonly id: string;
	readonly index: number;
	/** The records a `multi` card reads, its own first. */
	readonly ids: readonly string[];
}
export type RowProps = Slot & { readonly tick: number };
export type Row = (props: RowProps) => OctaneNode;
export type Body = (props: { slots: readonly Slot[]; tick: number }) => OctaneNode;
