import { initializeHydrationEventCapture } from 'octane/hydration';
import { startHydrationBootstrap } from '../../../../hydration-interactivity/shared.js';

startHydrationBootstrap(
	() => import('./hydration-client.js'),
	() => initializeHydrationEventCapture(document),
);
