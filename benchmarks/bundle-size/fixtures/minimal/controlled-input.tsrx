import { createRoot, useState } from 'octane';

// A controlled text input. Its restore pass needs text restoration only: no
// select projection and no checked or radio-group restoration.
function ControlledInput() @{
	const [text, setText] = useState('a');
	<input
		id="minimal-controlled-input"
		value={text}
		onInput={(event: Event) => setText((event.target as HTMLInputElement).value.toUpperCase())}
	/>
}

export async function run(container: HTMLElement) {
	const root = createRoot(container);
	root.render(ControlledInput);
	const input = container.querySelector('#minimal-controlled-input') as HTMLInputElement;
	const before = input.value;
	input.value = 'b';
	input.dispatchEvent(new Event('input', { bubbles: true }));
	await Promise.resolve();
	const after = input.value;
	root.unmount();
	return { before, after, cleaned: container.childNodes.length === 0 };
}
