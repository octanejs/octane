import { createElement, createRoot, flushSync, type OctaneNode } from 'octane';
import { NestedWorkRows } from './NestedWorkRows.tsrx';

const ROWS = 1000;
const KINDS = ['nested', 'flat', 'explicit'] as const;
type Kind = (typeof KINDS)[number];
type WorkRoot = ReturnType<typeof createRoot>;

function row(index: number, keyed: boolean): OctaneNode {
	return createElement(
		'li',
		{ key: keyed ? `row-${index}` : undefined, 'data-work-index': index },
		createElement('input', { defaultValue: String(index), 'aria-label': `row ${index}` }),
	);
}

function explicit(): OctaneNode {
	return createElement(
		'li',
		{ key: '0', 'data-work-index': 'explicit' },
		createElement('input', { defaultValue: 'explicit', 'aria-label': 'explicit row' }),
	);
}

function makeRows(kind: Kind): OctaneNode[] {
	const siblings: OctaneNode[] = [];
	for (let index = 0; index < ROWS; index++) {
		siblings.push(row(index, kind === 'explicit'));
		if (index === 0) siblings.push(explicit());
	}
	if (kind === 'flat') return siblings;
	// A same-kind nested array plus a sibling gives each enclosed leaf a real
	// wrapper path. Its explicit key remains the serialization control.
	return [siblings, createElement('li', { key: 'tail', 'data-work-index': 'tail' }, 'tail')];
}

// Prepare the two descriptor generations before timing. Every update still
// changes the rows reference and traverses the full child list.
const prepared: Record<Kind, [OctaneNode[], OctaneNode[]]> = {
	nested: [makeRows('nested'), makeRows('nested')],
	flat: [makeRows('flat'), makeRows('flat')],
	explicit: [makeRows('explicit'), makeRows('explicit')],
};
const roots: Partial<Record<Kind, WorkRoot>> = {};
const containers: Partial<Record<Kind, HTMLElement>> = {};
const versions: Record<Kind, number> = { nested: 0, flat: 0, explicit: 0 };

function update(kind: Kind): void {
	const root = roots[kind];
	if (!root) throw new Error(`${kind} work root is not mounted`);
	versions[kind] = 1 - versions[kind];
	root.render(NestedWorkRows, {
		id: `${kind}-work-rows`,
		rows: prepared[kind][versions[kind]],
		version: versions[kind],
	});
	flushSync(() => {});
}

export function runNestedWork(operation: string): void {
	if (operation === 'mount') {
		if (KINDS.some((kind) => roots[kind])) throw new Error('nested work roots are already mounted');
		for (const kind of KINDS) {
			const container = document.createElement('div');
			container.id = `${kind}-work-root`;
			document.body.appendChild(container);
			const root = createRoot(container);
			roots[kind] = root;
			containers[kind] = container;
			versions[kind] = 0;
			root.render(NestedWorkRows, {
				id: `${kind}-work-rows`,
				rows: prepared[kind][0],
				version: 0,
			});
		}
		flushSync(() => {});
		return;
	}
	if (operation.startsWith('update-')) {
		const kind = operation.slice(7) as Kind;
		if (!KINDS.includes(kind)) throw new Error(`unknown nested work kind: ${kind}`);
		update(kind);
		return;
	}
	if (operation === 'unmount') {
		for (const kind of KINDS) {
			roots[kind]?.unmount();
			containers[kind]?.remove();
			delete roots[kind];
			delete containers[kind];
		}
		return;
	}
	throw new Error(`unknown nested work operation: ${operation}`);
}
