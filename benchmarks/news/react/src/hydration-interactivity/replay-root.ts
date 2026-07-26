import { createElement } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { hydrationProps } from '../../../../hydration-interactivity/shared.js';
import { App } from './App.js';

let replayRoot: ReturnType<typeof hydrateRoot> | undefined;

export function initializeReactReplayRoot() {
	const container = document.getElementById('app');
	const status = window.__hydrationInteractivity;
	if (!container) throw new Error('Missing hydration benchmark root');
	if (!status) throw new Error('Hydration benchmark bootstrap did not run');
	if (replayRoot) throw new Error('React replay root was initialized more than once');

	replayRoot = hydrateRoot(container, createElement(App, hydrationProps()));
	status.replayRootInitializedAt = performance.now();
	return replayRoot;
}

export function getReactReplayRoot() {
	return replayRoot;
}
