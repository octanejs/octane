import { useCallback, useState } from 'octane';
import { subSlot } from '../internal';

export function useForceUpdate(slot?: symbol): () => void {
	const setState = useState(0, subSlot(slot, 'state'))[1];
	return useCallback(
		() => {
			setState((value) => value + 1);
		},
		[],
		subSlot(slot, 'callback'),
	);
}
