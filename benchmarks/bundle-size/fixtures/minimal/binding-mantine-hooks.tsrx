import { createRoot } from 'octane';
import { useCounter } from '@octanejs/mantine-hooks';

function Counter() @{
	const [count, actions] = useCounter(2, { min: 0, max: 3 });
	<button id="minimal-mantine-counter" onClick={() => actions.set(3)}>{count as string}</button>
}

export async function run(container: HTMLElement) {
	const root = createRoot(container);
	root.render(Counter);
	const button = container.querySelector('#minimal-mantine-counter') as HTMLButtonElement;
	const before = button.textContent;
	button.click();
	await Promise.resolve();
	const after = button.textContent;
	root.unmount();
	return { before, after, cleaned: container.childNodes.length === 0 };
}
