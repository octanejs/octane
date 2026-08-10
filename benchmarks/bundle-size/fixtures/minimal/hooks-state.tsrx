import { createRoot, useLayoutEffect, useState } from 'octane';

let clicks = 0;
let effects = 0;
let cleanups = 0;

function StatefulCounter() @{
	const [count, setCount] = useState(0);
	useLayoutEffect(() => {
		effects++;
		return () => {
			cleanups++;
		};
	}, []);
	<button
		id="minimal-state-action"
		onClick={() => {
			clicks++;
			setCount(count + 1);
		}}
	>{String(count) as string}</button>
}

export async function run(container: HTMLElement) {
	const root = createRoot(container);
	root.render(StatefulCounter);
	await Promise.resolve();
	const button = container.querySelector('#minimal-state-action') as HTMLButtonElement;
	const before = button.textContent;
	button.click();
	await Promise.resolve();
	const after = button.textContent;
	root.unmount();
	return {
		before,
		after,
		clicks,
		effects,
		cleanups,
		cleaned: container.childNodes.length === 0,
	};
}
