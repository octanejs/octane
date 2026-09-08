import { createRoot } from 'octane';

export function RefComponent(props: { callback: (node: HTMLDivElement | null) => void }) @{
	<div ref={props.callback}>ready</div>
}

export async function run(container: HTMLElement, Component = RefComponent) {
	const calls: string[] = [];
	const first = (node: HTMLDivElement | null) => {
		calls.push(node === null ? 'first:detach' : 'first:attach');
	};
	const second = (node: HTMLDivElement | null) => {
		calls.push(node === null ? 'second:detach' : 'second:attach');
	};
	const root = createRoot(container);
	root.render(Component, { callback: first });
	await Promise.resolve();
	const element = container.firstElementChild;
	root.render(Component, { callback: second });
	await Promise.resolve();
	const sameElement = container.firstElementChild === element;
	const text = container.textContent;
	root.unmount();
	return { calls, sameElement, text, cleaned: container.childNodes.length === 0 };
}
