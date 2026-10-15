/** @jsxImportSource octane */
import { createRoot } from 'octane';

const view = <span>native</span>;

export function run(container: HTMLElement) {
	const root = createRoot(container);
	root.render(() => view);
	const text = container.textContent;
	root.unmount();
	return { text, cleaned: container.childNodes.length === 0 };
}
