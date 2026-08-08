import { createElement, createRoot } from 'octane';
import { Separator } from '@octanejs/base-ui';

export function run(container: HTMLElement) {
	const root = createRoot(container);
	root.render(createElement(Separator, { id: 'minimal-base-ui', orientation: 'vertical' }));
	const separator = container.querySelector('#minimal-base-ui') as HTMLElement;
	const snapshot = {
		role: separator.getAttribute('role'),
		orientation: separator.getAttribute('aria-orientation'),
	};
	root.unmount();
	return { ...snapshot, cleaned: container.childNodes.length === 0 };
}
