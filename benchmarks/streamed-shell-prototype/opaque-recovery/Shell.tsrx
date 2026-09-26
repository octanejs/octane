import { useLayoutEffect, useState } from 'octane';
import { currentSignalOwner } from 'octane/signals';
import { Frame } from '../opaque-metrics-frame/Frame.tsrx';
import { Ready } from '../opaque-metrics-frame/Ready.tsrx';
import { session$ } from '../opaque-metrics-frame/State.tsrx';

type Props = { initialTick?: number };

export function Shell(props: Props) @{
	if (typeof document !== 'undefined') {
		const stats = (globalThis as any).__recoveryRenderer;
		stats.renderOwnerChecks++;
		const scope = currentSignalOwner();
		stats.renderOwnerMatched = !!scope && 'documentOwner' in scope &&
			scope.documentOwner === (globalThis as any).__recoveryOwner;
	}
	const [tick, setTick] = useState(props.initialTick ?? 0);
	useLayoutEffect(() => {
		const stats = (globalThis as any).__recoveryRenderer;
		stats.starts++;
		stats.active++;
		const timer = setInterval(() => {
			stats.ticks++;
			setTick((value: number) => value + 1);
		}, 400);
		return () => {
			clearInterval(timer);
			stats.stops++;
			stats.active--;
		};
	}, []);
	<main id="island" data-octane-hydrate-id="fixture" data-octane-hydrate-when="load">
		<Frame
			rows={[
				{ id: 'timer', text: String(tick) },
			]}
		>
			@try {
				const status = session$.get();
				<Ready status={status} onClick={() => {}} />
			} @pending {
				<p id="pending">Waiting for configuration</p>
			} @catch {
				<p id="error">Configuration failed</p>
			}
		</Frame>
	</main>
}
