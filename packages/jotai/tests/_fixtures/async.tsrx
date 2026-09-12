import { useEffect, useState } from 'octane';
import type { Atom } from 'jotai/vanilla';
import { useAtomValue, useAtomValueRaw } from '@octanejs/jotai';

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

// Raw reads let applications own loading/error UI without a Suspense boundary.
export function RawPromiseApp(props: { asyncAtom: Atom<Promise<number>> }) @{
	const promise = useAtomValueRaw(props.asyncAtom);
	const [state, setState] = useState('loading');
	useEffect(() => {
		let active = true;
		setState('loading');
		promise.then(
			(value) => {
				if (active) setState('hasData:' + value);
			},
			(error) => {
				if (active) setState(
					'hasError:' + (error instanceof Error ? error.message : String(error)),
				);
			},
		);
		return () => {
			active = false;
		};
	}, [promise]);
	<span id="raw">{state as string}</span>
}

// unwrap(asyncAtom, fallback) — sync view of an async atom, no boundary.
export function UnwrapApp(props: { unwrapped: any }) @{
	const v = useAtomValue(props.unwrapped);
	<span id="unwrap">{'v=' + v}</span>
}
