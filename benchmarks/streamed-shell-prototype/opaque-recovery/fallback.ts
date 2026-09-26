import { hydrateRoot } from 'octane';
import type { SignalOwner } from 'octane/signals';
import { Shell } from './Shell.tsrx';

export function hydrate(owner: SignalOwner, initialTick: number, invalidContainer: boolean) {
	return hydrateRoot(
		invalidContainer ? (null as never) : document.body,
		Shell,
		{ initialTick },
		{
			signalOwner: owner,
		},
	);
}
