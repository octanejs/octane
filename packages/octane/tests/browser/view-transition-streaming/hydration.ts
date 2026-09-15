import { hydrateRoot } from 'octane';
import { interaction } from 'octane/hydration';
import { QueuedHydrationApp } from '../../_fixtures/view-transition-ssr.tsrx';

export function hydrate(container: HTMLElement) {
	const state = { hydrated: 0, clicks: 0 };
	const root = hydrateRoot(
		container,
		QueuedHydrationApp,
		{
			parent: Promise.resolve('Live button'),
			child: Promise.resolve('Recovered child'),
			recover: true,
			when: interaction(),
			onHydrated() {
				state.hydrated++;
			},
			onClick() {
				state.clicks++;
			},
		},
		{ onRecoverableError() {} },
	);
	return { state, unmount: () => root.unmount() };
}

declare global {
	interface Window {
		OctaneStreamHydration: { hydrate: typeof hydrate };
	}
}
window.OctaneStreamHydration = { hydrate };
