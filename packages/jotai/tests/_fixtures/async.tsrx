import { useAtomValue } from '@octanejs/jotai';

// Async-atom fixtures — the reader suspends through octane's use() on the
// binding's continuable promise; the boundary provides the pending fallback
// and error surface. Deferreds are created and settled by the test.

function AsyncReader(props: { asyncAtom: any }) @{
	const v = useAtomValue(props.asyncAtom);
	<span id="async">{'v=' + v}</span>
}

export function AsyncApp(props: { asyncAtom: any }) @{
	<div>
		@try {
			<AsyncReader asyncAtom={props.asyncAtom} />
		} @pending {
			<span id="fallback">{'loading'}</span>
		} @catch (e) {
			<span id="error">{'error:' + (e as any).message}</span>
		}
	</div>
}

// loadable(asyncAtom) — no suspense boundary needed; renders the state enum.
export function LoadableApp(props: { loadableAtom: any }) @{
	const state = useAtomValue(props.loadableAtom);
	<span id="loadable">
		{state.state + (state.state === 'hasData' ? ':' + state.data : '') +
			(state.state === 'hasError' ? ':' + (state.error as any).message : '')}
	</span>
}

// unwrap(asyncAtom, fallback) — sync view of an async atom, no boundary.
export function UnwrapApp(props: { unwrapped: any }) @{
	const v = useAtomValue(props.unwrapped);
	<span id="unwrap">{'v=' + v}</span>
}
