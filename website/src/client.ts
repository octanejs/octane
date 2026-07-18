import { hydrateRoot, initializeHydrationEventCapture } from 'octane';
import { StartClient, hydrateStart } from '@tanstack/octane-start/client';

// Start can await router preparation before it creates the root. Install the
// lightweight deferred-hydration intent queue first so an interaction with the
// server HTML during that gap is replayed after its boundary hydrates.
initializeHydrationEventCapture();

hydrateStart().then((router) => {
	const container = document.getElementById('__app');

	if (!container) {
		throw new Error('TanStack Start could not find the Octane hydration root.');
	}

	hydrateRoot(container, StartClient, { router });
});
