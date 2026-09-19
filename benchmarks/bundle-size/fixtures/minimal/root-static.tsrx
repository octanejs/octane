import { createRoot } from 'octane';

function StaticRoot() @{
	<main id="minimal-root">{'Octane'}</main>
}

export function createReusableRoot(container: HTMLElement) {
	return createRoot(container);
}

export function run(container: HTMLElement) {
	const root = createReusableRoot(container);
	root.render(() => 'generic');
	const returnedText = container.textContent;
	root.render(StaticRoot);
	const text = container.textContent;
	root.unmount();
	return { returnedText, text, cleaned: container.childNodes.length === 0 };
}
