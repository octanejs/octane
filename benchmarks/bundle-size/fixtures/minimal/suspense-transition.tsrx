import { createRoot, startTransition, use, useState } from 'octane';

function SuspendedValue(props: { resource: Promise<string> }) @{
	const value = use(props.resource);
	<span id="minimal-suspense-value">{value as string}</span>
}

function SuspenseRoot(props: { initial: Promise<string>; next: Promise<string> }) @{
	const [resource, setResource] = useState(props.initial);
	<div>
		<button
			id="minimal-transition-action"
			onClick={() => startTransition(() => setResource(props.next))}
		>{'advance'}</button>
		@try {
			<SuspendedValue resource={resource} />
		} @pending {
			<span id="minimal-suspense-fallback">{'loading'}</span>
		}
	</div>
}

async function waitForVisibleValue(container: HTMLElement, expected: string) {
	const deadline = performance.now() + 2_000;
	while (true) {
		const value = container.querySelector<HTMLElement>('#minimal-suspense-value');
		if (
			value?.textContent === expected &&
				container.querySelector('#minimal-suspense-fallback') === null &&
				getComputedStyle(value).display !== 'none'
		) {
			return value;
		}
		if (performance.now() >= deadline) {
			throw new Error(`Suspense did not visibly commit ${expected}.`);
		}
		await new Promise((resolve) => setTimeout(resolve, 10));
	}
}

export async function run(container: HTMLElement) {
	let resolveInitial!: (value: string) => void;
	let resolveNext!: (value: string) => void;
	const initial = new Promise<string>((resolve) => {
		resolveInitial = resolve;
	});
	const next = new Promise<string>((resolve) => {
		resolveNext = resolve;
	});
	const root = createRoot(container);
	root.render(SuspenseRoot, { initial, next });
	const pending = container.querySelector('#minimal-suspense-fallback')!.textContent;
	resolveInitial!('ready');
	// Retry-only reveals can stage a hidden primary before its fallback is
	// removed. Begin the transition only after the ready screen visibly commits.
	const committed = await waitForVisibleValue(container, 'ready');
	const resolved = committed.textContent;
	(container.querySelector('#minimal-transition-action') as HTMLButtonElement).click();
	await Promise.resolve();
	if (
		container.querySelector('#minimal-suspense-value') !== committed ||
			committed.textContent !== resolved ||
			getComputedStyle(committed).display === 'none' ||
			container.querySelector('#minimal-suspense-fallback') !== null
	) {
		throw new Error('A pending transition replaced the committed Suspense content.');
	}
	resolveNext!('next');
	const transition = (await waitForVisibleValue(container, 'next')).textContent;
	root.unmount();
	return { pending, resolved, transition, cleaned: container.childNodes.length === 0 };
}
