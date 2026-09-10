import { createElement, createRoot, flushSync, type OctaneNode } from 'octane';
import { UnkeyedRows } from './UnkeyedRows.tsrx';

const ROWS = 1000;
let root: ReturnType<typeof createRoot> | null = null;
let container: HTMLElement | null = null;

function makeRows(): OctaneNode[] {
	const rows: OctaneNode[] = [];
	for (let index = 0; index < ROWS; index++) {
		rows.push(
			createElement(
				'li',
				{ 'data-work-index': index },
				createElement('input', { defaultValue: String(index), 'aria-label': `row ${index}` }),
			),
		);
		if (index === 0) {
			// Explicit string "0" must never adopt the unkeyed row at implicit index 0.
			rows.push(
				createElement(
					'li',
					{ key: '0', 'data-work-index': 'explicit' },
					createElement('input', { defaultValue: 'explicit', 'aria-label': 'explicit row' }),
				),
			);
		}
	}
	return rows;
}

export function runUnkeyedWork(operation: string): void {
	if (operation === 'load') return;
	if (operation === 'mount') {
		if (root !== null) throw new Error('unkeyed work root is already mounted');
		container = document.createElement('div');
		container.id = 'unkeyed-work-root';
		document.body.appendChild(container);
		root = createRoot(container);
		root.render(UnkeyedRows, { rows: makeRows(), version: 0 });
		flushSync(() => {});
		return;
	}
	if (operation === 'update') {
		if (root === null) throw new Error('unkeyed work root is not mounted');
		root.render(UnkeyedRows, { rows: makeRows(), version: 1 });
		flushSync(() => {});
		return;
	}
	if (operation === 'unmount') {
		root?.unmount();
		root = null;
		container?.remove();
		container = null;
		return;
	}
	throw new Error(`unknown unkeyed work operation: ${operation}`);
}
