import { equal } from '@wry/equality';
import * as React from 'octane';
export function useDeepMemo(memoFn, deps, site) {
	const ref = React.useRef(void 0, site);
	// eslint-disable-next-line react-hooks/refs
	if (!ref.current || !equal(ref.current.deps, deps)) {
		ref.current = { value: memoFn(), deps };
	}
	// eslint-disable-next-line react-hooks/refs
	return ref.current.value;
}
