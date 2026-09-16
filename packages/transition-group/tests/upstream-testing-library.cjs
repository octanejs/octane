const { createRequire } = require('node:module');
const { dirname, join } = require('node:path');

const requireFromPackage = createRequire(`${__dirname}/../package.json`);
const testingLibraryRoot = dirname(
	requireFromPackage.resolve('@testing-library/react/package.json'),
);
const testingLibrary = require(join(testingLibraryRoot, 'dist/pure.js'));
const ReactDOM = require('react-dom');
const { drainZeroDelayTimers, flushTimerUpdates } = require('./upstream-timer-order.cjs');

const IMMEDIATE_TRANSITION_TEST =
	'Transition should mount/unmount immediately if not have enter/exit timeout';

module.exports = {
	...testingLibrary,
	render(element, options) {
		const flush = (callback) => ReactDOM.flushSync(callback);
		const result = flushTimerUpdates(() => testingLibrary.render(element, options), flush);
		// The upstream oracle starts a real 10 ms guard before rerendering. Capture
		// and drain the transition's 0 ms completion inside flushSync so elapsed
		// renderer time cannot make that earlier guard win on a loaded CI runner.
		return {
			...result,
			rerender(nextElement) {
				const rerender = () => flushTimerUpdates(() => result.rerender(nextElement), flush);
				if (expect.getState().currentTestName !== IMMEDIATE_TRANSITION_TEST) return rerender();
				return drainZeroDelayTimers(() => ReactDOM.flushSync(rerender), flush);
			},
		};
	},
};
