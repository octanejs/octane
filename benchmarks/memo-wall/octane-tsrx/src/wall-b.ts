// Wall B's row factory is an ordinary exported helper. Direct callers retain
// this loop and its fresh createElement descriptors; the compiler never changes
// the helper's public implementation or installs a shared mutable cache.
//
// In production TSRX, the Vite adapter can prove this helper's factory/component
// imports and its render-only callsite. A private companion then reuses output
// for unchanged inputs and descriptors for unchanged same-index item/key pairs.
// Changed inputs still execute every authored item and raw-key read. The JSX
// twin and unsupported calls/build modes keep the ordinary helper path.
//
// Both paths exercise Row's default memo contract and retain native event
// handlers. The work gates distinguish factory/reconciler savings from skipped
// Row, Inner, and Leaf bodies.
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
