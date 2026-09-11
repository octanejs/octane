import { createElement, createRoot, flushSync, type OctaneNode } from 'octane';
import { CompiledRows, ManyDescriptorLists, ManyMappedLists } from './KeyCallbackRows.tsrx';

type Kind = 'many' | 'mapped' | 'compiled';
const GROUPS = 512;
const ROWS = GROUPS * 4;

function descriptor(group: number, row: number): OctaneNode {
	const id = group * 4 + row;
	return createElement(
		'li',
		{ key: row === 0 ? undefined : row === 1 ? '0' : `row-${row}`, 'data-row': id },
		createElement('input', { defaultValue: `row ${id}`, 'aria-label': `row ${id}` }),
	);
}

function groups(reordered: boolean) {
	return Array.from({ length: GROUPS }, (_, id) => ({
		id,
		rows: (reordered ? [0, 3, 1, 2] : [0, 1, 2, 3]).map((row) => descriptor(id, row)),
	}));
}

function rows(reordered: boolean) {
	const values = Array.from({ length: ROWS }, (_, id) => ({ id, label: `row ${id}` }));
	return reordered ? values.toReversed() : values;
}

function mappedGroups(reordered: boolean, stringKeys: boolean = false) {
	return Array.from({ length: GROUPS }, (_, group) => ({
		id: group,
		rows: (reordered ? [0, 3, 1, 2] : [0, 1, 2, 3]).map((index) => ({
			id: group * 4 + index,
			key: stringKeys ? String(group * 4 + index) : group * 4 + index,
			label: `row ${group * 4 + index}`,
		})),
	}));
}

// Two equivalent generations force list traversal on unrelated updates. A
// third generation checks reorder identity; all construction precedes timing.
const prepared = {
	many: [groups(false), groups(false), groups(true)],
	// Numeric and string forms must retain the same mapped identity.
	mapped: [mappedGroups(false), mappedGroups(false, true), mappedGroups(true)],
	// Distinct outer arrays retain the same rows. This keeps the compiled
	// control on the pure survivor path where key-read overhead is exposed.
	compiled: (() => {
		const stable = rows(false);
		return [stable.slice(), stable.slice(), stable.toReversed()];
	})(),
};
const roots: Partial<Record<Kind, ReturnType<typeof createRoot>>> = {};
const containers: Partial<Record<Kind, HTMLElement>> = {};
const versions: Record<Kind, number> = { many: 0, mapped: 0, compiled: 0 };

function render(kind: Kind, generation: number): void {
	const root = roots[kind];
	if (root === undefined) throw new Error(`${kind} is not mounted`);
	if (kind === 'many') {
		root.render(ManyDescriptorLists, {
			groups: prepared.many[generation],
			version: versions[kind],
		});
	} else if (kind === 'mapped') {
		root.render(ManyMappedLists, { groups: prepared.mapped[generation], version: versions[kind] });
	} else {
		root.render(CompiledRows, { rows: prepared.compiled[generation], version: versions[kind] });
	}
	flushSync(() => {});
}

export function runKeyCallbackWork(operation: string): void {
	const [action, kind] = operation.split('-') as [string, Kind];
	if (kind !== 'many' && kind !== 'mapped' && kind !== 'compiled')
		throw new Error(`unknown kind ${kind}`);
	if (action === 'mount') {
		if (roots[kind] !== undefined) throw new Error(`${kind} is already mounted`);
		const container = document.createElement('div');
		document.body.appendChild(container);
		containers[kind] = container;
		roots[kind] = createRoot(container);
		versions[kind] = 0;
		render(kind, 0);
	} else if (action === 'update') {
		versions[kind] = 1 - versions[kind];
		render(kind, versions[kind]);
	} else if (action === 'reorder') {
		render(kind, 2);
	} else if (action === 'restore') {
		render(kind, versions[kind]);
	} else if (action === 'unmount') {
		roots[kind]?.unmount();
		containers[kind]?.remove();
		delete roots[kind];
		delete containers[kind];
	} else {
		throw new Error(`unknown operation ${operation}`);
	}
}
