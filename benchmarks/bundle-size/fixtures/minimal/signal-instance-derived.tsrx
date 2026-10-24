// A derived$ declared inside a component can be declared again by a later
// render, so its module installs the declaration views that stage it.
import { createRoot } from 'octane';
import { derived$, signal$ } from 'octane/signals';

function NextCount() @{
	const count$ = signal$(0);
	const next$ = derived$(() => count$.get() + 1);
	<button id="minimal-signal-action" onClick={() => count$.set(count$.get() + 1)}>
		{String(next$.get()) as string}
	</button>
}

export async function run(container: HTMLElement) {
	const root = createRoot(container);
	root.render(NextCount);
	const button = container.querySelector('#minimal-signal-action') as HTMLButtonElement;
	const before = button.textContent;
	button.click();
	await Promise.resolve();
	const after = button.textContent;
	root.unmount();
	return { before, after, cleaned: container.childNodes.length === 0 };
}
