// A client that only calls createRoot and declares signals. A module-level
// signal$ creates its cell through the document owner and a component's through
// the renderer's owner. Both cells look up early control edits, which only a
// hydration entry point claims, and their reads can throw the miss of a
// hydrating read, which only hydration supplies.
import { createRoot } from 'octane';
import { signal$ } from 'octane/signals';

const theme$ = signal$('light');

function Counter() @{
	const count$ = signal$(0);
	<button id="signals-action" onClick={() => count$.set(count$.get() + 1)}>
		{`${theme$.get()} ${count$.get()}` as string}
	</button>
}

export function run(container: HTMLElement) {
	const root = createRoot(container);
	root.render(Counter);
	const button = container.querySelector('#signals-action') as HTMLButtonElement;
	const before = button.textContent;
	button.click();
	const after = button.textContent;
	root.unmount();
	return { before, after, cleaned: container.childNodes.length === 0 };
}
