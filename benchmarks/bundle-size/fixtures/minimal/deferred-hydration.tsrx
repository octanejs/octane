import { flushSync, Hydrate, hydrateRoot, useState } from 'octane';
import { initializeHydrationEventCapture, interaction } from 'octane/hydration';

function DeferredButton(props: { onActivate: () => void }) @{
	const [label, setLabel] = useState('dormant');
	<button
		id="minimal-deferred-action"
		onClick={() => {
			props.onActivate();
			setLabel('active');
		}}
	>{label as string}</button>
}

function DeferredRoot(props: { onActivate: () => void }) @{
	<main>
		<Hydrate when={interaction()} split={false}>
			<DeferredButton onActivate={props.onActivate} />
		</Hydrate>
	</main>
}

export async function run(container: HTMLElement) {
	container.innerHTML =
		'<main><!--[--><div data-octane-hydrate-id=":in-0:" data-octane-hydrate-when="interaction" data-octane-hydrate-id-count="0"><!--[--><!--[--><!--[--><!--[--><button id="minimal-deferred-action">dormant</button><!--]--><!--]--><!--]--><!--]--></div><!--]--></main>';
	let clicks = 0;
	const button = container.querySelector('#minimal-deferred-action') as HTMLButtonElement;
	const before = button.textContent;
	initializeHydrationEventCapture(container.ownerDocument);
	button.click();
	const root = hydrateRoot(container, DeferredRoot, {
		onActivate: () => {
			clicks++;
		},
	});
	flushSync(() => {});
	await new Promise<void>((resolve) => {
		requestAnimationFrame(() => setTimeout(resolve, 0));
	});
	const after = button.textContent;
	root.unmount();
	return { before, after, clicks, cleaned: container.childNodes.length === 0 };
}
