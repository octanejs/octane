import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { hydrateRoot } from 'react-dom/client';
import { completeHydration, hydrationProps } from '../../../../hydration-interactivity/shared.js';
import { App } from './App.js';
import { getReactReplayRoot } from './replay-root.js';

export function hydrateBenchmark() {
	const container = document.getElementById('app');
	if (!container) throw new Error('Missing hydration benchmark root');

	return completeHydration(() => {
		let root = getReactReplayRoot();
		flushSync(() => {
			root ??= hydrateRoot(container, createElement(App, hydrationProps()));
		});
		return root;
	});
}
