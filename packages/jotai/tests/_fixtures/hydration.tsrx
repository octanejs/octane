import { Provider, useAtomValueRaw, useAtomValueRawSync, useSetAtom } from '@octanejs/jotai';
import type { PrimitiveAtom } from 'jotai/vanilla';
import type { Store } from '../../src/react/store';

function Reader(props: { count: PrimitiveAtom<number> }) @{
	const value = useAtomValueRaw(props.count);
	const snapshot = useAtomValueRawSync(props.count);
	const setCount = useSetAtom(props.count);
	<button id="snapshot" onClick={() => setCount((value) => value + 1)}>
		{'raw=' + value + ' sync=' + snapshot}
	</button>
}

export function HydrationApp(props: { count: PrimitiveAtom<number>; store: Store }) @{
	<Provider store={props.store}>
		<Reader count={props.count} />
	</Provider>
}
