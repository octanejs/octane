import { mountBindings, type BindingHandle } from 'octane/behavior';
import { AttachmentPresentation } from '../../_fixtures/dom-presentation.tsrx';

export function mountPresentationRows(
	parent: Element,
	initial: readonly { id: number; label: string }[],
): { update(rows: typeof initial): void; dispose(): void } {
	let rows = initial;
	let notify: (() => void) | undefined;
	const binding: BindingHandle = mountBindings({ parent }, AttachmentPresentation, {
		getSnapshot: () => ({
			items: rows.map(
				(row) => ({
					id: String(row.id),
					name: row.label,
					preview: null,
					state: 'ready' as const,
					error: '',
				}),
			),
			locked: false,
			onRemove() {},
			onRetry() {},
		}),
		subscribe(callback) {
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
