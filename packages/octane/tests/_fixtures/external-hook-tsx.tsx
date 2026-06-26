import { useState } from 'octane';
import { useExternalCounter } from './external-hook.ts';

// A `.tsx` component (TS + JSX, full-compiled) that (a) holds its own base hook and
// (b) consumes the `.ts` custom hook — proving hooks work in `.tsx` and compose
// with a hook from a plain `.ts` module.
export function TsxApp(props: { base: number }) {
	const [local, setLocal] = useState<number>(props.base);
	const c = useExternalCounter(0);
	return (
		<div>
			<button class="local" onClick={() => setLocal(local + 1)}>
				{local as string}
			</button>
			<button class="ext" onClick={c.inc}>
				{c.n as string}
			</button>
		</div>
	);
}

// Same `.ts` hook reused twice inside one `.tsx` component → independent state.
export function TsxReuse() {
	const a = useExternalCounter(0);
	const b = useExternalCounter(100);
	return (
		<div>
			<button class="xa" onClick={a.inc}>
				{a.n as string}
			</button>
			<button class="xb" onClick={b.inc}>
				{b.n as string}
			</button>
		</div>
	);
}
