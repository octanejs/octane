import { animate } from '@octanejs/motion';

export async function run(container: HTMLElement) {
	const element = container.ownerDocument.createElement('div');
	container.appendChild(element);
	const animation = animate(element, { opacity: 0.25 }, { duration: 0 });
	animation.complete();
	await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
	const snapshot = {
		opacity: element.style.opacity,
		stoppable: typeof animation.stop === 'function',
	};
	animation.stop();
	element.remove();
	return { ...snapshot, cleaned: container.childNodes.length === 0 };
}
