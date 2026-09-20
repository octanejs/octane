import { createElement } from 'octane';

export function registerDockingEditor(): void {
	if (customElements.get('octane-docking-editor')) return;
	customElements.define(
		'octane-docking-editor',
		class extends HTMLElement {
			static observedAttributes = ['data-dock'];
			attributeChangedCallback(_name: string, _previous: string | null, target: string | null) {
				// Embedded editors can reparent their host while applying a native configuration.
				if (target) this.ownerDocument.getElementById(target)?.appendChild(this);
			}
		},
	);
}

export function DockingEditorApp(props: { dock: string; anchor: boolean }) {
	return createElement('section', {
		id: 'editor-home',
		children: [
			createElement('octane-docking-editor', {
				key: 'editor',
				'data-dock': props.dock,
				children: createElement('input', { defaultValue: 'Original draft' }),
			}),
			props.anchor
				? createElement('span', { key: 'anchor', id: 'editor-anchor', children: 'Tools' })
				: null,
		],
	});
}
