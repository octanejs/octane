import { AsyncLocalStorage } from 'node:async_hooks';
import {
	currentSignalOwner,
	installSignalOwnerEnvironment,
	type SignalOwner,
	type SignalOwnerEnvironment,
} from 'octane/signals';
import { installSignalOwnerEnvironment as installServerEnvironment } from 'octane/server';

// A host carrier that stores owners as SignalOwner still satisfies the contract.
const storage = new AsyncLocalStorage<SignalOwner>();
const carrier: SignalOwnerEnvironment = {
	current: () => storage.getStore() ?? null,
	run: (owner, callback) => storage.run(owner, callback),
	capture: (owner) => (callback) => storage.run(owner, callback),
};
installSignalOwnerEnvironment(carrier)();
installServerEnvironment(carrier)();

// A carrier sees owners only as identities, so it cannot reach the Scope API.
installServerEnvironment({
	current: () => null,
	run(owner, callback) {
		const key: string = owner.scopeKey;
		void key;
		if ('signal$' in owner) {
			// @ts-expect-error A carried owner never narrows to Scope.
			owner.inspect();
		}
		return callback();
	},
	capture: () => (callback) => callback(),
})();

// Application code still receives the whole union and may narrow to Scope.
const owner = currentSignalOwner();
if (owner !== null && 'signal$' in owner) {
	const scopeKey: string = owner.inspect().scopeKey;
	void scopeKey;
}
