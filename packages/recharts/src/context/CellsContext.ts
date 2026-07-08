// octane-only (no upstream counterpart): Cell props collection by
// REGISTRATION. React recharts reads `<Cell>` children via findAllByType —
// element introspection that octane's compiled children (opaque block
// functions) cannot support. Instead, octane Cells REGISTER their props into
// this collector when rendered, mirroring the redux-registration pattern
// recharts v3 itself adopted for every other child type. Registration order is
// mount order, which octane guarantees follows tree order (sibling layout
// effects run in order), so indexes line up with data indexes exactly like the
// upstream element order did.
import { createContext, useContext, useMemo, useState } from 'octane';
import { splitSlot, subSlot } from '../internal';

export interface CellRegistry {
	register(token: object, props: unknown): void;
	unregister(token: object): void;
}

/** The shape upstream's `cells[index].props` access expects. */
export interface RegisteredCell {
	props: unknown;
}

export const CellsContext = createContext<CellRegistry | null>(null);

function toCellArray(map: Map<object, unknown>): RegisteredCell[] | undefined {
	if (map.size === 0) {
		return undefined;
	}
	return Array.from(map.values(), (props) => ({ props }));
}

/**
 * Owns the collected cells state. Returns `[cells, registry]`; provide the
 * registry via `<CellsContext.Provider value={registry}>` around the item's
 * children, and pass `cells` wherever upstream passed findAllByType's result.
 * `cells` is `undefined` until the first Cell registers — matching upstream,
 * where a childless item passes an empty find result whose `cells[index]`
 * lookups are all undefined.
 */
export function useCellRegistry(...rest: any[]): [RegisteredCell[] | undefined, CellRegistry] {
	const [, slot] = splitSlot(rest);
	const [cells, setCells] = useState<RegisteredCell[] | undefined>(
		undefined,
		subSlot(slot, 'cr:s'),
	);
	const registry = useMemo(
		() => {
			const entries = new Map<object, unknown>();
			let scheduled = false;
			const publish = () => {
				if (scheduled) return;
				scheduled = true;
				// One state update per commit no matter how many cells registered.
				queueMicrotask(() => {
					scheduled = false;
					setCells(toCellArray(entries));
				});
			};
			return {
				register(token: object, props: unknown) {
					entries.set(token, props);
					publish();
				},
				unregister(token: object) {
					entries.delete(token);
					publish();
				},
			};
		},
		[],
		subSlot(slot, 'cr:m'),
	);
	return [cells, registry];
}

/** Read the ambient registry (null outside a cell-collecting graphical item). */
export function useCellsRegistry(): CellRegistry | null {
	// Context reads resolve by walking the block tree — no slot needed.
	return useContext(CellsContext);
}
