import { createContext, useContext, useLayoutEffect, useState } from 'octane';

const Theme = createContext('default');
let cleanups = 0;

export function readCleanups() {
	return cleanups;
}

function Reader(props: { fail?: boolean }) @{
	if (props.fail) throw new Error('abandoned provider');
	const value = useContext(Theme);
	const [count, update] = useState(0);
	useLayoutEffect(
		() => () => {
			cleanups++;
		},
	);
	<section>
		<span class="value" title={value}>{value as string}</span>
		<button onClick={() => update(count + 1)}>{String(count) as string}</button>
		<input defaultValue="seed" />
	</section>
}

export function App(props: { value: string; fail?: boolean }) @{
	<main>
		<Theme value={props.value}>
			<Reader fail={props.fail} />
		</Theme>
	</main>
}

export function Nested(props: { outer: string; inner: string }) @{
	<main>
		<Reader />
		<Theme value={props.outer}>
			<Reader />
			<Theme value={props.inner}>
				<Reader />
			</Theme>
			<Reader />
		</Theme>
	</main>
}

export function Held(props: { value: string; read: () => string }) @{
	<section>
		<Theme value={props.value}>
			<Reader />
		</Theme>
		<p>{props.read() as string}</p>
	</section>
}
