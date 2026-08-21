import { createRoot, drainPassiveEffects, flushSync } from 'octane';
import { ActivityRefPrimer, RefControl } from './RefControl.tsrx';
import { installRefBenchmark } from './ref-browser';

const target = document.getElementById('main');
if (target === null) throw new Error('Missing #main');
const flush = (callback: () => void) => {
	flushSync(callback);
	drainPassiveEffects();
};

installRefBenchmark(
	target,
	() => {
		const root = createRoot(target);
		return {
			render: (props) => flush(() => root.render(RefControl, props)),
			unmount: () => flush(() => root.unmount()),
		};
	},
	(container, modes) => {
		const root = createRoot(container);
		for (const mode of modes) flush(() => root.render(ActivityRefPrimer, { mode }));
		return () => flush(() => root.unmount());
	},
);
