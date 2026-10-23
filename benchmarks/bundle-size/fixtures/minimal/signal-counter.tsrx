// A signal$ counter whose template has no renderable hole: installing the
// implicit signal child must not retain the renderable-hole machinery. Its
// instance derived$ keeps the declaration views a later render stages.
import { createRoot } from 'octane';
import { derived$, signal$ } from 'octane/signals';

function SignalCounter() @{
	const count$ = signal$(0);
	const next$ = derived$(() => count$.get() + 1);
	<button
		id="minimal-signal-action"
		title={String(next$.get())}
		onClick={() => count$.set(count$.get() + 1)}
	>
		{String(count$.get()) as string}
	</button>
}

export async function run(container: HTMLElement) {
	const root = createRoot(container);
	root.render(SignalCounter);
	const button = container.querySelector('#minimal-signal-action') as HTMLButtonElement;
	const before = button.textContent;
	button.click();
	await Promise.resolve();
	const after = button.textContent;
	root.unmount();
	return { before, after, cleaned: container.childNodes.length === 0 };
}
