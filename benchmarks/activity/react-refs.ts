import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { ActivityRefPrimer, RefControl } from './RefControl.tsrx';
import { installRefBenchmark } from './ref-browser';

const target = document.getElementById('main');
if (target === null) throw new Error('Missing #main');

installRefBenchmark(
	target,
	() => {
		const root = createRoot(target);
		return {
			render: (props) => flushSync(() => root.render(createElement(RefControl, props))),
			unmount: () => flushSync(() => root.unmount()),
		};
	},
	(container, modes) => {
		const root = createRoot(container);
		for (const mode of modes) {
			flushSync(() => root.render(createElement(ActivityRefPrimer, { mode })));
		}
		return () => flushSync(() => root.unmount());
	},
);
