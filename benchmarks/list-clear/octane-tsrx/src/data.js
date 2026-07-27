// Rows are deliberately plain host elements with no effects, refs, or child
// components: this suite measures the DOM removal strategy a bulk clear picks,
// so per-item teardown work would only add noise on top of it. Each row is a
// small subtree (not a single node) because the two strategies differ in how
// they scale with nodes-per-item.

let seq = 0;

export function buildItems(count) {
	const items = new Array(count);
	for (let i = 0; i < count; i++) {
		items[i] = { id: ++seq, label: 'row-' + i };
	}
	return items;
}
