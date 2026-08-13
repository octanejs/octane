const { createRequire } = require('node:module');
const { dirname, join } = require('node:path');

const requireFromPackage = createRequire(`${__dirname}/../package.json`);
const testingLibraryRoot = dirname(
	requireFromPackage.resolve('@testing-library/react/package.json'),
);
const testingLibrary = require(join(testingLibraryRoot, 'dist/index.js'));
const { holdFirstTimeout } = require('./upstream-timer-gate.cjs');

const REMOTE_MUTATION_RACE_TEST =
	'useSWR - remote mutation should prevent race conditions with `useSWR`';

let releaseInitialRequest = null;

function isRemoteMutationRaceTest() {
	return expect.getState().currentTestName === REMOTE_MUTATION_RACE_TEST;
}

function render(element, options) {
	if (!isRemoteMutationRaceTest()) return testingLibrary.render(element, options);
	if (releaseInitialRequest !== null) {
		throw new Error('The remote-mutation request timer is already held');
	}

	// The upstream case gives the initial request a 10 ms timer and assumes the
	// click starts a mutation before that timer fires. Hold that one completion
	// through the click so a loaded runner cannot turn the intended race into a
	// sequential request followed by a mutation.
	const held = holdFirstTimeout(10, () => testingLibrary.render(element, options));
	releaseInitialRequest = held.release;
	return held.result;
}

const fireEvent = (...args) => testingLibrary.fireEvent(...args);
Object.assign(fireEvent, testingLibrary.fireEvent, {
	click(...args) {
		const result = testingLibrary.fireEvent.click(...args);
		if (!isRemoteMutationRaceTest()) return result;
		if (releaseInitialRequest === null) {
			throw new Error('The remote-mutation request timer was not held');
		}

		const release = releaseInitialRequest;
		releaseInitialRequest = null;
		release();
		return result;
	},
});

module.exports = { ...testingLibrary, fireEvent, render };
