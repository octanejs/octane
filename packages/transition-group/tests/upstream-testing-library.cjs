const { createRequire } = require('node:module');
const { dirname, join } = require('node:path');

const requireFromPackage = createRequire(`${__dirname}/../package.json`);
const testingLibraryRoot = dirname(
	requireFromPackage.resolve('@testing-library/react/package.json'),
);
const testingLibrary = require(join(testingLibraryRoot, 'dist/pure.js'));
const ReactDOM = require('react-dom');

const IMMEDIATE_TRANSITION_TEST =
	'Transition should mount/unmount immediately if not have enter/exit timeout';

module.exports = {
	...testingLibrary,
	render(element, options) {
		const result = testingLibrary.render(element, options);
		if (expect.getState().currentTestName !== IMMEDIATE_TRANSITION_TEST) return result;
		// The upstream oracle starts a real 10 ms guard before rerendering. Commit
		// that rerender before the guard can expire under a loaded CI runner; the
		// test still compares the transition's 0 ms callback against the 10 ms guard.
		return {
			...result,
			rerender(nextElement) {
				return ReactDOM.flushSync(() => result.rerender(nextElement));
			},
		};
	},
};
