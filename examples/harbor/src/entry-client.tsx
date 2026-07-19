// Hydration entry. `?hydrateDelay=<ms>` (capped) delays hydrateRoot so the
// pre-hydration journey can interact with server DOM first; OctaneCompat
// sniffs hydrate-vs-fresh-mount on its own, so the tree is identical to the
// server's apart from the client Compat variant.
import { hydrateRoot } from 'react-dom/client';
import { OctaneCompat } from 'octane/react';
import { App } from './App.tsx';
import { isHarborFault } from './data/resources.ts';

const params = new URLSearchParams(window.location.search);
const requestedDelay = Number(params.get('hydrateDelay') ?? '0');
const hydrateDelay = Math.min(
	2000,
	Math.max(0, Number.isFinite(requestedDelay) ? requestedDelay : 0),
);
if (hydrateDelay > 0) {
	await new Promise((resolve) => setTimeout(resolve, hydrateDelay));
}

const url = window.location.pathname + window.location.search;

hydrateRoot(document.getElementById('root')!, <App url={url} Compat={OctaneCompat} />, {
	onCaughtError(error, errorInfo) {
		// The deterministic outage is the fault journey doing its job; anything
		// else keeps React's default (loud) behavior so the e2e diagnostics gate
		// catches real regressions.
		if (isHarborFault(error)) return;
		console.error(error, errorInfo.componentStack);
	},
});
