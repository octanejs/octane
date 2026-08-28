import { useEffect, useLayoutEffect, useMemo, useState } from 'octane';
import { setListener, type Listener } from '../../core/index.ts';
import { subSlot } from '../../internal.ts';

export function useSignals(...rest: [slot?: symbol]): void {
	const slot = typeof rest[0] === 'symbol' ? rest[0] : undefined;
	const [, setVersion] = useState(0, subSlot(slot, 'version'));
	const listener = useMemo<Listener>(
		() => [() => setVersion((version) => version + 1), new Set()],
		[],
		subSlot(slot, 'listener'),
	);
	const cleanSubscribers = () => {
		for (const subscriber of listener[1]) subscriber.delete(listener);
		listener[1].clear();
	};

	cleanSubscribers();

	const isServer = typeof document === 'undefined';
	if (!isServer) setListener(listener);

	useLayoutEffect(
		() => {
			if (!isServer) setListener(undefined);
		},
		null,
		subSlot(slot, 'clear-listener'),
	);
	useEffect(() => cleanSubscribers, [listener], subSlot(slot, 'cleanup'));
}
