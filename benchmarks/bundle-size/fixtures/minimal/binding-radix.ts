import { createElement, createRoot } from 'octane';
import { Separator } from '@octanejs/radix';

export function run(container: HTMLElement) {
	const root = createRoot(container);
	root.render(createElement(Separator.Root, { id: 'minimal-radix', orientation: 'vertical' }));
	const separator = container.querySelector('#minimal-radix') as HTMLElement;
	const snapshot = {
		role: separator.getAttribute('role'),
		orientation: separator.getAttribute('aria-orientation'),
		dataOrientation: separator.getAttribute('data-orientation'),
	};
	root.unmount();
	return { ...snapshot, cleaned: container.childNodes.length === 0 };
}
