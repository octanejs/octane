import { createElement, createRoot } from 'octane';

// The reusable descriptor API must not retain an unused Activity implementation.
// Its own semantic oracle preserves the descriptor-only public contract.
export function run(container: HTMLElement) {
	const root = createRoot(container);
	root.render(createElement('main', { id: 'minimal-root' }, 'Octane'));
	const text = container.textContent;
	root.unmount();
	return { text, cleaned: container.childNodes.length === 0 };
}
