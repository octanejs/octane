import { createRoot } from 'octane';

function StaticRoot() @{
	<main id="minimal-root">{'Octane'}</main>
}

export function run(container: HTMLElement) {
	const root = createRoot(container);
	root.render(StaticRoot);
	const text = container.textContent;
	root.unmount();
	return { text, cleaned: container.childNodes.length === 0 };
}
