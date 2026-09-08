import { createRoot, drainPassiveEffects, flushSync } from 'octane';
import { App } from './App.tsrx';
import { installBenchmark } from './browser';

const target = document.getElementById('main');
if (target === null) throw new Error('Missing #main');

installBenchmark(target, () => {
	const root = createRoot(target);
	const flush = (callback: () => void) => {
		flushSync(callback);
		// Match React's sync-commit passive dispatch, as effectful-list does.
		// Hidden background completion is still observed through the real DOM.
		drainPassiveEffects();
	};
	return {
		render: (props) => flush(() => root.render(App, props)),
		flush,
		unmount: () => flush(() => root.unmount()),
	};
});
