import * as Octane from 'octane';

export function Content() @{
	const [count, setCount] = Octane.useState(0);
	const initial = Octane.useRef('first');
	const label = Octane.useMemo(() => ({ text: 'first' }), []);
	<div>
		<input defaultValue="draft" />
		<span>{label.text as string}</span>
		<p>{initial.current as string}</p>
		<button onClick={() => setCount(count + 1)}>{String(count)}</button>
	</div>
}

export function Retry() @{
	const [ready, setReady] = Octane.useState(false);
	if (!ready) Octane.useMemo(() => 'temporary', []);
	const label = Octane.useMemo(() => 'accepted', []);
	if (!ready) setReady(true);
	<span>{label as string}</span>
}
