const { createRequire } = require('node:module');
const { dirname, join } = require('node:path');

const requireFromPackage = createRequire(`${__dirname}/../package.json`);
const testingLibraryRoot = dirname(
	requireFromPackage.resolve('@testing-library/react/package.json'),
);
const testingLibrary = require(join(testingLibraryRoot, 'dist/index.js'));
const {
	createSupersedingTimeoutGate,
	holdFirstTimeout,
	holdRepeatingTimeouts,
} = require('./upstream-timer-gate.cjs');

const REMOTE_MUTATION_RACE_TEST =
	'useSWR - remote mutation should prevent race conditions with `useSWR`';
const REMOTE_MUTATION_MULTIPLE_TEST =
	'useSWR - remote mutation should prevent race condition if triggered multiple times';
const LOCAL_MUTATION_VALIDATING_TEST =
	'useSWR - local mutation should reset isValidating after mutate';
const LOCAL_MUTATION_VALIDATING_TEXT = 'isValidating:true';
const BROADCAST_TESTS = new Set(['useSWR should broadcast data', 'useSWR should broadcast error']);
const BROADCAST_RELEASE_TEXTS = new Set(['0 0 0', '1 1 1']);

let releaseInitialRequest = null;
let releaseLocalMutationInitialRequest = null;
let supersedingMutationTimers = null;
let broadcastPollingTimers = null;

afterEach(() => {
	broadcastPollingTimers?.restore();
	broadcastPollingTimers = null;
});

function isRemoteMutationRaceTest() {
	return expect.getState().currentTestName === REMOTE_MUTATION_RACE_TEST;
}

function isLocalMutationValidatingTest() {
	return expect.getState().currentTestName === LOCAL_MUTATION_VALIDATING_TEST;
}

function isRemoteMutationMultipleTest() {
	return expect.getState().currentTestName === REMOTE_MUTATION_MULTIPLE_TEST;
}

function isBroadcastTest() {
	return BROADCAST_TESTS.has(expect.getState().currentTestName);
}

function render(element, options) {
	if (isRemoteMutationRaceTest()) {
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

	if (isLocalMutationValidatingTest()) {
		if (releaseLocalMutationInitialRequest !== null) {
			throw new Error('The local-mutation request timer is already held');
		}

		// Data can reuse the request started by Page instead of scheduling another
		// timer when it mounts. Hold that initial completion through the unchanged
		// isValidating assertion so runner load cannot finish it before the click.
		const held = holdFirstTimeout(30, () => testingLibrary.render(element, options));
		releaseLocalMutationInitialRequest = held.release;
		return held.result;
	}

	if (isRemoteMutationMultipleTest()) {
		// The first two mutation requests use 10 ms timers separated by 5 ms
		// waits. Keep each superseded completion pending until the next click has
		// started its replacement; the third request retains its real timer.
		supersedingMutationTimers = createSupersedingTimeoutGate(10, 2);
	}

	if (isBroadcastTest()) {
		// Three subscribers poll every 100 ms, and the test asserts each count after
		// sleeping to 50, 150, and 250 ms. A loaded runner delays the act() turns
		// between those sleeps but not the polling chain, so a refresh can land before
		// the count it should follow. Hold each polling round until the previous count
		// is observed. The round after the last count stays held until unmount clears
		// it, as it does when the test ends at 250 ms.
		broadcastPollingTimers = holdRepeatingTimeouts(100, () =>
			testingLibrary.render(element, options),
		);
		return broadcastPollingTimers.result;
	}

	return testingLibrary.render(element, options);
}

const fireEvent = (...args) => testingLibrary.fireEvent(...args);
Object.assign(fireEvent, testingLibrary.fireEvent, {
	click(...args) {
		if (isRemoteMutationMultipleTest()) {
			if (supersedingMutationTimers === null) {
				throw new Error('The repeated remote-mutation timer gate was not initialized');
			}
			return supersedingMutationTimers.run(() => testingLibrary.fireEvent.click(...args));
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
		if (releaseLocalMutationInitialRequest === null) {
			throw new Error('The local-mutation request timer was not held');
		}

		const release = releaseLocalMutationInitialRequest;
		releaseLocalMutationInitialRequest = null;
		release();
	}
	if (isBroadcastTest() && BROADCAST_RELEASE_TEXTS.has(args[0])) {
		// Fire the round inside the act() the test enters next, as its timer would.
		queueMicrotask(broadcastPollingTimers.release);
	}
	return result;
}

const screen = new Proxy(testingLibrary.screen, {
	get(target, property, receiver) {
		return property === 'getByText' ? getByText : Reflect.get(target, property, receiver);
	},
});

module.exports = { ...testingLibrary, fireEvent, render, screen };
