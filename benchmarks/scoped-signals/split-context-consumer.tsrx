import {
	act,
	createContext,
	createRoot,
	Hydrate,
	useContext,
	useLayoutEffect,
	useState,
} from 'octane';
import { load } from 'octane/hydration';

const Theme = createContext('default');

function Reader() @{
	const value = useContext(Theme);
	<p>{value as string}</p>
}

function App(props: { effects: string[] }) @{
	const [value, setValue] = useState('first');
	useLayoutEffect(() => {
		props.effects.push('mount');
		return () => {
			props.effects.push('cleanup');
		};
	}, []);
	<main>
		<Theme value="outer">
			<Reader />
		</Theme>
		<Hydrate when={load()}>
			<Theme value={value}>
				<button onClick={() => setValue('second')}>{value as string}</button>
			</Theme>
		</Hydrate>
	</main>
}

export async function run(host: HTMLElement) {
	const effects: string[] = [];
	const root = createRoot(host);
	root.render(App, { effects });
	await act(() => {});
	const button = host.querySelector('button')!;
	const initial = host.textContent;
	button.click();
	await act(() => {});
	const result = {
		initial,
		updated: host.textContent,
		identity: button === host.querySelector('button'),
	};
	root.unmount();
	return { ...result, effects, cleaned: host.childNodes.length === 0 };
}
