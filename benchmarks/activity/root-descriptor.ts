import { createElement, createRoot } from 'octane';

// The reusable descriptor API must not retain an unused Activity implementation.
// Reuse bundle-reachability's root-static semantic oracle for these exact bytes.
export function run(container: HTMLElement) {
	const root = createRoot(container);
	root.render(createElement('main', { id: 'minimal-root' }, 'Octane'));
	const text = container.textContent;
	root.unmount();
	return { text, cleaned: container.childNodes.length === 0 };
}
