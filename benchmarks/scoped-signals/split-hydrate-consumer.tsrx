import { createRoot, act, Hydrate, useState, useLayoutEffect } from 'octane';
import { load } from 'octane/hydration';

type Props = { label: string; effect: (phase: 'mount' | 'cleanup') => void };
function Editor(props: Props) @{
	const [count, setCount] = useState(0);
	useLayoutEffect(() => {
		props.effect('mount');
		return () => props.effect('cleanup');
	}, []);
	<button onClick={() => setCount(count + 1)}>{props.label + ':' + count}</button>
}
function App(props: Props) @{
	<Hydrate when={load()}>
		<Editor {...props} />
	</Hydrate>
}
export async function run(host: HTMLElement) {
	const effects: string[] = [];
	const props: Props = { label: 'first', effect: (phase) => effects.push(phase) };
	const root = createRoot(host);
	root.render(App, props);
	await act(() => {});
	const button = host.querySelector('button')!;
	const initial = button.textContent;
	button.click();
	await act(() => {});
	const result = {
		initial,
		updated: button.textContent,
		identity: button === host.querySelector('button'),
	};
	root.unmount();
	return { ...result, effects, cleaned: host.childNodes.length === 0 };
}
