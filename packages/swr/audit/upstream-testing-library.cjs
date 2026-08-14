const { createRequire } = require('node:module');
const { dirname, join } = require('node:path');

const requireFromPackage = createRequire(`${__dirname}/../package.json`);
const testingLibraryRoot = dirname(
	requireFromPackage.resolve('@testing-library/react/package.json'),
);
const testingLibrary = require(join(testingLibraryRoot, 'dist/index.js'));
const { holdFirstTimeout, holdNextTimeout } = require('./upstream-timer-gate.cjs');

const REMOTE_MUTATION_RACE_TEST =
	'useSWR - remote mutation should prevent race conditions with `useSWR`';
const LOCAL_MUTATION_VALIDATING_TEST =
	'useSWR - local mutation should reset isValidating after mutate';
const LOCAL_MUTATION_VALIDATING_TEXT = 'isValidating:true';

let releaseInitialRequest = null;
let releaseLocalMutationRevalidation = null;

function isRemoteMutationRaceTest() {
	return expect.getState().currentTestName === REMOTE_MUTATION_RACE_TEST;
}

function isLocalMutationValidatingTest() {
	return expect.getState().currentTestName === LOCAL_MUTATION_VALIDATING_TEST;
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
		if (isLocalMutationValidatingTest() && args[0]?.textContent === 'show') {
			if (releaseLocalMutationRevalidation !== null) {
				throw new Error('The local-mutation revalidation timer is already held');
			}

			// Mounting Data starts a 30 ms revalidation. Hold its completion until
			// the unchanged upstream assertion has observed the in-flight state so
			// runner load cannot make the request finish between click and query.
			const gate = holdNextTimeout(30);
			releaseLocalMutationRevalidation = gate.releaseWhenScheduled;
			try {
				return testingLibrary.fireEvent.click(...args);
			} catch (error) {
				releaseLocalMutationRevalidation = null;
				gate.cancel();
				throw error;
			}
		}

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

function getByText(...args) {
	const result = testingLibrary.screen.getByText(...args);
	if (isLocalMutationValidatingTest() && args[0] === LOCAL_MUTATION_VALIDATING_TEXT) {
		if (releaseLocalMutationRevalidation === null) {
			throw new Error('The local-mutation revalidation timer was not held');
		}

		const release = releaseLocalMutationRevalidation;
		releaseLocalMutationRevalidation = null;
		release();
	}
	return result;
}

const screen = new Proxy(testingLibrary.screen, {
	get(target, property, receiver) {
		return property === 'getByText' ? getByText : Reflect.get(target, property, receiver);
	},
});

module.exports = { ...testingLibrary, fireEvent, render, screen };
