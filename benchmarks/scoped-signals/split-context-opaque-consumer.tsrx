import {
	act,
	createContext,
	createElement,
	createRoot,
	flushSync,
	Hydrate,
	useContext,
	useLayoutEffect,
} from 'octane';
import { load } from 'octane/hydration';
import type { SignalHandle } from 'octane/signals';

const Theme = createContext<string | SignalHandle<string>>('default');
const Exported = createContext('exported default');
export { Exported };

function Reader() @{
	const value = useContext(Theme);
	<span title={value}>{value as string}</span>
}

function App(props: { value: string | SignalHandle<string>; effects: string[] }) @{
	useLayoutEffect(() => {
		props.effects.push('mount');
		return () => {
			props.effects.push('cleanup');
		};
	}, []);
	<Hydrate when={load()}>
		<Theme value={props.value}>
			<Reader />
			<input defaultValue="initial" />
		</Theme>
	</Hydrate>
}

function ExportedReader() @{
	<span>{useContext(Exported) as string}</span>
}

export async function run(host: HTMLElement) {
	const effects: string[] = [];
	const root = createRoot(host);
	await act(() => root.render(App, { value: 'plain', effects }));
	const initial = host.textContent;
	const span = host.querySelector('span')!;
	const input = host.querySelector('input')!;
	input.value = 'typed';
	const { createScope } = await import('octane/signals');
	const scope = createScope({ scopeKey: 'private-split-context-late-model' });
	const value = scope.signal$('value', 'first');
	try {
		await act(() => root.render(App, { value, effects }));
		const opaque = host.textContent;
		flushSync(() => value.set('second'));
		const result = {
			initial,
			opaque,
			notification: host.textContent,
			title: span.getAttribute('title'),
			identity: span === host.querySelector('span') && input === host.querySelector('input'),
			draft: input.value,
		};
		root.unmount();
		flushSync(() => value.set('retired'));
		const retired = span.textContent;
		const descriptors = createRoot(host);
		flushSync(
			() => descriptors.render(Exported, {
				value: 'provided',
				children: createElement(ExportedReader, null),
			}),
		);
		const descriptor = host.textContent;
		flushSync(() => descriptors.render(Exported, { children: ['ordinary', ' text'] }));
		const returned = host.textContent;
		descriptors.unmount();
		return {
			...result,
			retired,
			descriptor,
			returned,
			effects,
			cleaned: host.childNodes.length === 0,
		};
	} finally {
		root.unmount();
		scope.dispose();
	}
}
