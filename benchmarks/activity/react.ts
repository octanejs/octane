import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { App } from './App.tsrx';
import { installBenchmark } from './browser';

const target = document.getElementById('main');
if (target === null) throw new Error('Missing #main');

installBenchmark(target, () => {
	const root = createRoot(target);
	return {
		render: (props) => flushSync(() => root.render(createElement(App, props))),
		flush: (callback) => flushSync(callback),
		unmount: () => flushSync(() => root.unmount()),
	};
});
