import {
	act,
	createContext,
	createRoot,
	hydrateRoot,
	use,
	useLayoutEffect,
	useState,
} from 'octane';

// Production compiles specialize the function-local roots below
// (`__createVoidRoot`/`__hydrateVoidRoot`) and the module-private context
// (`__createCompiledContext`), including in projects that configure renderer
// boundaries for other modules. Dev compiles keep the public factories, so the
// two projects compare the same observations.
const Tone = createContext('default');
let cleanups = 0;

function Label() @{
	<b>{use(Tone) as string}</b>
}

export function View(props: { label: string }) @{
	const [count, update] = useState(0);
	useLayoutEffect(
		() => () => {
			cleanups++;
		},
		[],
	);
	<main>
		<button onClick={() => update(count + 1)}>{`${props.label}:${count}`}</button>
		<Tone value={props.label}>
			<Label />
		</Tone>
		<input />
	</main>
}

export async function mountLocalRoot(host: HTMLElement) {
	cleanups = 0;
	const root = createRoot(host);
	root.render(View, { label: 'first' });
	const before = await interact(host);
	root.render(View, { label: 'second' });
	await act(() => {});
	const after = settle(host, before);
	root.unmount();
	return { ...after, cleanups, cleaned: host.childNodes.length === 0 };
}

export async function hydrateLocalRoot(host: HTMLElement) {
	cleanups = 0;
	const server = host.querySelector('button');
	const root = hydrateRoot(host, View, { label: 'first' });
	await act(() => {});
	const adopted = server !== null && server === host.querySelector('button');
	const before = await interact(host);
	root.render(View, { label: 'second' });
	await act(() => {});
	const after = settle(host, before);
	root.unmount();
	return { ...after, adopted, cleanups, cleaned: host.childNodes.length === 0 };
}

async function interact(host: HTMLElement) {
	const button = host.querySelector('button')!;
	const input = host.querySelector('input')!;
	const initial = host.textContent;
	input.value = 'typed';
	await act(() => button.click());
	return { button, input, initial, clicked: host.textContent };
}

function settle(host: HTMLElement, before: Awaited<ReturnType<typeof interact>>) {
	const { button, input, initial, clicked } = before;
	const retained =
		button === host.querySelector('button') && input === host.querySelector('input') &&
			input.value === 'typed';
	return { initial, clicked, updated: host.textContent, retained };
}
