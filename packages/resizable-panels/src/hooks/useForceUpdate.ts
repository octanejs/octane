import { useCallback, useState } from 'octane';
import { subSlot } from '../internal';

export function useForceUpdate(slot?: symbol) {
	const [sigil, setSigil] = useState({}, subSlot(slot, 'state'));
	const forceUpdate = useCallback(() => setSigil({}), [], subSlot(slot, 'callback'));
	return [sigil as unknown, forceUpdate] as const;
}
