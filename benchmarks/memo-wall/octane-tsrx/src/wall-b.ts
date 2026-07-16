// Wall B's row factory — a PLAIN .ts module the octane compiler never touches.
// It hands back raw `createElement(Row, props)` descriptors that reach the DOM
// through the wall's `{rows}` children hole, i.e. childSlot's keyed de-opt
// list → the childSlot arm of tryMemoBail. This is exactly the shape every
// @octanejs binding produces (no compiled template for the rows at all).
//
// Whenever `items` changes, a fresh descriptor + fresh props OBJECT is allocated
// for every row. Production autoMemo skips this helper entirely while its input
// snapshot is equal; on a one-item change, the memo wall must still succeed on
// prop VALUES (all primitives + the module-level selectRow handler), not object
// identity.
import { createElement } from 'octane';

import { Row } from './rows.tsrx';
import { selectRow } from './ops.js';

export function buildValueRows(items: any[]): any[] {
	const out = new Array(items.length);
	for (let i = 0; i < items.length; i++) {
		const it = items[i];
		out[i] = createElement(Row, {
			key: it.id,
			id: it.id,
			label: it.label,
			value: it.value,
			wall: 'B',
			onSelect: selectRow,
		});
	}
	return out;
}
