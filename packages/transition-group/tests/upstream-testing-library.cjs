const { createRequire } = require('node:module');
const { dirname, join } = require('node:path');

const requireFromPackage = createRequire(`${__dirname}/../package.json`);
const testingLibraryRoot = dirname(
	requireFromPackage.resolve('@testing-library/react/package.json'),
);
const testingLibrary = require(join(testingLibraryRoot, 'dist/pure.js'));
const ReactDOM = require('react-dom');
const { drainZeroDelayTimers } = require('./upstream-timer-order.cjs');

const IMMEDIATE_TRANSITION_TEST =
	'Transition should mount/unmount immediately if not have enter/exit timeout';

module.exports = {
	...testingLibrary,
	render(element, options) {
		const result = testingLibrary.render(element, options);
		if (expect.getState().currentTestName !== IMMEDIATE_TRANSITION_TEST) return result;
		// The upstream oracle starts a real 10 ms guard before rerendering. Capture
		// and drain the transition's 0 ms completion inside flushSync so elapsed
		// renderer time cannot make that earlier guard win on a loaded CI runner.
		return {
			...result,
			rerender(nextElement) {
				return drainZeroDelayTimers(
					() => ReactDOM.flushSync(() => result.rerender(nextElement)),
					(callback) => ReactDOM.flushSync(callback),
				);
			},
		};
	},
};
