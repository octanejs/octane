import { createElement } from 'octane/server';
import { prerender } from 'octane/static';

const h = createElement as (type: any, props?: any, ...children: any[]) => any;
type ListKind = 'nested' | 'flat' | 'explicit';

function Row(props: { id: number | 'explicit' }) {
	return h('li', { 'data-index': props.id }, `row ${props.id}`);
}

function makeRows(explicit: boolean) {
	const rows = Array.from({ length: 1000 }, (_, id) =>
		h(Row, explicit ? { id, key: `row-${id}` } : { id }),
	);
	// A string key "0" must remain distinct from implicit position zero.
	rows.splice(1, 0, h(Row, { id: 'explicit', key: '0' }));
	return rows;
}

// Reuse descriptors across renders so timing isolates traversal and SSR work.
// Component leaves force the identity path; pure host leaves would bypass it.
const rows = makeRows(false);
const children = { nested: [rows], flat: rows, explicit: [makeRows(true)] };

function NestedDescriptorPage(props: { kind: ListKind }) {
	return h('ul', { id: `${props.kind}-descriptors` }, children[props.kind]);
}

export async function renderNestedDescriptors(kind: ListKind) {
	return prerender(NestedDescriptorPage as any, { kind });
}
