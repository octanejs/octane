import { createRoot } from 'octane';
import { useCounter } from '@octanejs/usehooks-ts';

function Counter() @{
	const counter = useCounter(4);
	<button
		id="minimal-usehooks-counter"
		onClick={counter.increment}
	>{counter.count as string}</button>
}

export async function run(container: HTMLElement) {
	const root = createRoot(container);
	root.render(Counter);
	const button = container.querySelector('#minimal-usehooks-counter') as HTMLButtonElement;
	const before = button.textContent;
	button.click();
	await Promise.resolve();
	const after = button.textContent;
	root.unmount();
	return { before, after, cleaned: container.childNodes.length === 0 };
}
