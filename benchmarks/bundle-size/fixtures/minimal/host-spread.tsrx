import { createRoot } from 'octane';

function View(props: { attributes: Record<string, string> }) @{
	<div {...props.attributes} />
}

export async function run(container: HTMLElement) {
	const root = createRoot(container);
	root.render(View, { attributes: { 'data-value': 'first', title: 'temporary' } });
	const element = container.firstElementChild!;
	const before = element.getAttribute('data-value');
	root.render(View, { attributes: { 'data-value': 'second' } });
	await Promise.resolve();
	const result = {
		before,
		after: element.getAttribute('data-value'),
		titleRemoved: !element.hasAttribute('title'),
		kept: container.firstElementChild === element,
	};
	root.unmount();
	return result;
}
