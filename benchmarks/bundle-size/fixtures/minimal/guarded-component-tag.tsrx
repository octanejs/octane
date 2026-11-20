import { createRoot, useState, type ComponentBody } from 'octane';

// A component chosen at runtime, rendered under a typeof-function guard, takes
// the function-only slot: no host string tag can reach it.
function First() @{
	<span id="minimal-guarded-tag-value">{'first'}</span>
}

function Second() @{
	<span id="minimal-guarded-tag-value">{'second'}</span>
}

function GuardedTagRoot() @{
	const [second, setSecond] = useState(false);
	const Tag: ComponentBody = second ? Second : First;
	<div>
		<button id="minimal-guarded-tag-action" onClick={() => setSecond(true)}>
			{'change'}
		</button>
		@if (typeof Tag === 'function') {
			<Tag />
		}
	</div>
}

export async function run(container: HTMLElement) {
	const root = createRoot(container);
	root.render(GuardedTagRoot);
	const before = container.querySelector('#minimal-guarded-tag-value')!.textContent;
	(container.querySelector('#minimal-guarded-tag-action') as HTMLButtonElement).click();
	await Promise.resolve();
	const after = container.querySelector('#minimal-guarded-tag-value')!.textContent;
	root.unmount();
	return { before, after, cleaned: container.childNodes.length === 0 };
}
