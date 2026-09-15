import { mountBindings, type BindingHandle } from 'octane/behavior';
import { AttachmentPresentation } from '../../_fixtures/dom-presentation.tsrx';
import { ShadowEditorRows } from './shadow-editor.tsrx';

export function mountPresentationRows(
	parent: Element,
	initial: readonly { id: number; label: string }[],
	shadowEditor = false,
): { update(rows: typeof initial): void; dispose(): void } {
	let rows = initial;
	let notify: (() => void) | undefined;
	function initializeEditor(host: HTMLDivElement | null): void {
		if (!host) return;
		// A native editor owns its shadow contents; the keyed presentation owns
		// only the surrounding host and must keep this editing subtree connected.
		const input = host.ownerDocument.createElement('input');
		input.name = host.dataset.editorId!;
		input.defaultValue = host.dataset.editorLabel!;
		host.attachShadow({ mode: 'open' }).appendChild(input);
	}
	const source = {
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
			onEditor: initializeEditor,
		}),
		subscribe(callback: () => void) {
			notify = callback;
			return () => {
				notify = undefined;
			};
		},
	};
	const binding: BindingHandle = shadowEditor
		? mountBindings({ parent }, ShadowEditorRows, source)
		: mountBindings({ parent }, AttachmentPresentation, source);
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
