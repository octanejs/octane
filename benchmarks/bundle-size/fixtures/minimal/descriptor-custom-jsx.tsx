/** @jsxImportSource octane */
import { createRoot } from 'octane';

const view = <octane-reachability-host data-label="ready" />;

export function run(container: HTMLElement) {
	let connectedLabel: string | null = null;
	customElements.define(
		'octane-reachability-host',
		class extends HTMLElement {
			connectedCallback() {
				connectedLabel = this.getAttribute('data-label');
			}
		},
	);
	const root = createRoot(container);
	root.render(() => view);
	const present = container.firstElementChild?.localName === 'octane-reachability-host';
	root.unmount();
	return { connectedLabel, present, cleaned: container.childNodes.length === 0 };
}
