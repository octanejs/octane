import { createElement } from 'octane/server';

// A plain descriptor list of component children is the server path that builds
// identity keys for every positional child. Pure host children are serialized
// directly and would never exercise this path.
const h = createElement as (type: any, props?: any, ...children: any[]) => any;

const ROWS = 1000;

function Row(props: { id: number | 'explicit' }) {
	return h('li', { 'data-index': props.id }, `row ${props.id}`);
}

export function UnkeyedDescriptorPage() {
	const rows = Array.from({ length: ROWS }, (_, id) => h(Row, { id }));
	// The explicit string key must remain distinct from the positional 0 key.
	rows.splice(1, 0, h(Row, { id: 'explicit', key: '0' }));
	return h('ul', { id: 'unkeyed-descriptors' }, rows);
}
