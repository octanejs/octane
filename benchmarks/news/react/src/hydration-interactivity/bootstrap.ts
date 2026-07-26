import {
	hydrationProps,
	startHydrationBootstrap,
} from '../../../../hydration-interactivity/shared.js';

startHydrationBootstrap(async () => {
	if (hydrationProps().deferred) {
		const { initializeReactReplayRoot } = await import('./replay-root.js');
		initializeReactReplayRoot();
	}

	return import('./hydration-client.js');
});
