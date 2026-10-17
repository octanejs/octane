import { createElement as h, createRoot, flushSync } from 'octane';

// A plain createElement tree: component and host descriptors, a keyed list and
// text reach the generic child slot, but nothing creates a portal, a signal
// handle or a Context.
function Row(props: { label: string }) {
	return h('li', { 'data-row': props.label }, props.label);
}

function List(props: { labels: string[] }) {
	return h(
		'ul',
		{ id: 'minimal-descriptor-list' },
		props.labels.map((label) => h(Row, { key: label, label })),
	);
}

export function run(container: HTMLElement) {
	const root = createRoot(container);
	flushSync(() => root.render(h(List, { labels: ['a', 'b'] })));
	const before = container.textContent;
	const kept = container.querySelector('[data-row="b"]');
	flushSync(() => root.render(h(List, { labels: ['b', 'c'] })));
	const after = container.textContent;
	const survivor = container.querySelector('[data-row="b"]') === kept;
	root.unmount();
	return { before, after, survivor, cleaned: container.childNodes.length === 0 };
}
