import { createElement } from 'octane';

interface EditorRow {
	id: number;
	label: string;
}

let nextEditorId = 0;

export function createRelocatingNativeEditors(
	external: Element,
	focusedId: number,
	shadow = false,
) {
	const tagName = 'relocating-native-editor-' + nextEditorId++;
	customElements.define(
		tagName,
		class extends HTMLElement {
			static observedAttributes = ['data-relocate'];
			connectedCallback() {
				const parent = this.shadowRoot ?? (shadow ? this.attachShadow({ mode: 'open' }) : this);
				if (parent.querySelector('input')) return;
				const input = this.ownerDocument.createElement('input');
				input.defaultValue = this.getAttribute('data-label')!;
				parent.appendChild(input);
			}
			attributeChangedCallback(_name: string, previous: string | null, next: string) {
				// A native editor may relocate its own host while its configuration changes.
				if (previous === '0' && next === '1' && Number(this.dataset.row) === focusedId)
					external.appendChild(this);
			}
		},
	);
	return function RelocatingEditors(props: { items: readonly EditorRow[]; revision: number }) {
		return createElement('section', {
			children: props.items.map((row) =>
				createElement(tagName, {
					key: row.id,
					'data-row': row.id,
					'data-label': row.label,
					'data-relocate': props.revision,
				}),
			),
		});
	};
}
