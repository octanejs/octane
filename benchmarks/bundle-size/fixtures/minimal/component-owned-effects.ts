import { createRoot } from 'octane';
import { RetainedOwnedComponent } from './component-owned-effects-components.tsrx';

export function run(container: HTMLElement) {
	const registrations: string[] = [];
	const addEventListener = container.addEventListener.bind(container);
	container.addEventListener = ((type, listener, options) => {
		registrations.push(type);
		return addEventListener(type, listener, options);
	}) as typeof container.addEventListener;

	let clicks = 0;
	const root = createRoot(container);
	root.render(RetainedOwnedComponent, {
		onClick: () => {
			clicks++;
		},
	});
	const button = container.querySelector('#minimal-owned-action') as HTMLButtonElement;
	const text = button.textContent;
	button.click();
	const styles = Array.from(
		document.querySelectorAll('style[data-octane]'),
		(style) => style.textContent ?? '',
	);
	root.unmount();

	return {
		text,
		clicks,
		clickRegistered: registrations.includes('click'),
		auxclickRegistered: registrations.includes('auxclick'),
		retainedStyle: styles.some((style) => style.includes('.retained-owned-component')),
		unusedStyle: styles.some((style) => style.includes('.unused-owned-component')),
		cleaned: container.childNodes.length === 0,
	};
}
