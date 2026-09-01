import { createRoot, drainPassiveEffects, flushSync } from 'octane';
import { installCaughtRevealBenchmark } from './caught-reveal-browser';
import type { CaughtRevealModel } from './caught-reveal-model';
import { HiddenCaughtReveal } from './HiddenCaughtReveal.tsrx';

const target = document.getElementById('main');
if (target === null) throw new Error('Missing #main');

installCaughtRevealBenchmark(target, (model: CaughtRevealModel) => {
	const root = createRoot(target, { onCaughtError: (error) => model.report(error) });
	return {
		render: (props) => {
			flushSync(() => root.render(HiddenCaughtReveal, props));
			drainPassiveEffects();
		},
		unmount: () => {
			flushSync(() => root.unmount());
			drainPassiveEffects();
		},
	};
});
