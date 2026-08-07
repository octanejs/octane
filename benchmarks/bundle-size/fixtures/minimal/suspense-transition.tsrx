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
			<span id="minimal-suspense-value">{'loading'}</span>
		}
	</div>
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
	const pending = container.querySelector('#minimal-suspense-value')!.textContent;
	resolveInitial!('ready');
	await Promise.resolve();
	await Promise.resolve();
	const resolved = container.querySelector('#minimal-suspense-value')!.textContent;
	(container.querySelector('#minimal-transition-action') as HTMLButtonElement).click();
	await Promise.resolve();
	if (container.querySelector('#minimal-suspense-value')!.textContent !== resolved) {
		throw new Error('A pending transition replaced the committed Suspense content.');
	}
	resolveNext!('next');
	await Promise.resolve();
	await Promise.resolve();
	const transition = container.querySelector('#minimal-suspense-value')!.textContent;
	root.unmount();
	return { pending, resolved, transition, cleaned: container.childNodes.length === 0 };
}
