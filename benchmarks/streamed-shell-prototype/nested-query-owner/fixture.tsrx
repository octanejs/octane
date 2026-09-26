import { useEffect, useState } from 'octane';
import { query$ } from 'octane/signals';

export interface StreamedShellProps {
	load: (key: string) => AsyncIterable<string>;
	onCleanup: () => void;
}

export function StreamedChild(props: StreamedShellProps) @{
	const value$ = query$(() => 'conversation', props.load, { kind: 'stream' });
	const [count, setCount] = useState(0);
	useEffect(() => () => props.onCleanup(), []);
	<section>
		@try {
			<output>{value$}</output>
		} @pending {
			<i>{'waiting'}</i>
		}
		<input defaultValue="server draft" />
		<button onClick={() => setCount(count + 1)}>{String(count)}</button>
	</section>
}

export function StreamedStaticShell(props: StreamedShellProps) @{
	<main>
		<h1>{'Server-rendered shell'}</h1>
		<StreamedChild load={props.load} onCleanup={props.onCleanup} />
	</main>
}
