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
	// A store update can arrive before the passive subscription mounts. Observe
	// its committed snapshot after the subscription catches up with the store.
	const deadline = performance.now() + 2_000;
	while (button.textContent !== '1') {
		if (performance.now() >= deadline) {
			throw new Error('The bound store did not commit its increment.');
		}
		await new Promise((resolve) => setTimeout(resolve, 10));
	}
	const after = button.textContent;
	root.unmount();
	return { before, after, cleaned: container.childNodes.length === 0 };
}
