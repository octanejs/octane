import { mountBindings } from 'octane/behavior';
import { BoundRows, type StatefulRow } from './rows.tsrx';

export function mountBoundRows(
	parent: Element,
	initial: readonly StatefulRow[],
): { update(rows: readonly StatefulRow[]): void; dispose(): void } {
	let rows = initial;
	let notify: (() => void) | undefined;
	const binding = mountBindings({ parent }, BoundRows, {
		getSnapshot: () => ({ items: rows.map((row) => ({ id: String(row.id) })) }),
		subscribe(callback: () => void) {
			notify = callback;
			return () => {
				notify = undefined;
			};
		},
	});
	return {
		update(next) {
			rows = next;
			notify?.();
		},
		dispose() {
			binding.dispose({ preserveDOM: false });
		},
	};
}
