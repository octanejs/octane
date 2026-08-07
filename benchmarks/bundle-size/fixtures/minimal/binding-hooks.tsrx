import { createRoot } from 'octane';
import { create } from '@octanejs/zustand';

const useCounter = create<{ count: number; increment: () => void }>(
	(set) => ({
		count: 0,
		increment: () => set((state) => ({ count: state.count + 1 })),
	}),
);

function BoundCounter() @{
	const count = useCounter((state) => state.count);
	const increment = useCounter((state) => state.increment);
	<button id="minimal-binding-action" onClick={increment}>{String(count) as string}</button>
}

export async function run(container: HTMLElement) {
	const root = createRoot(container);
	root.render(BoundCounter);
	const button = container.querySelector('#minimal-binding-action') as HTMLButtonElement;
	const before = button.textContent;
	button.click();
	await Promise.resolve();
	const after = button.textContent;
	root.unmount();
	return { before, after, cleaned: container.childNodes.length === 0 };
}
