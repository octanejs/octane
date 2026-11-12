import { preconnect, prefetchDNS, preinit, preinitModule, preload, preloadModule } from 'react-dom';
import type { ResourceHintHost } from '../resource-hint-diagnostics.js';

// React validates its own options. Forward arguments intact so the host owns
// deduplication, resource option transfer and hydration adoption.
export const reactResourceHints = {
	preconnect,
	prefetchDNS,
	preinit,
	preinitModule,
	preload,
	preloadModule,
} as ResourceHintHost;
