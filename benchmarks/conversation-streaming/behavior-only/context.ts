import { AsyncLocalStorage } from 'node:async_hooks';
import { installSignalOwnerEnvironment, type SignalOwner } from 'octane/signals';

export const requests = new AsyncLocalStorage<{ request: Request; owner: SignalOwner }>();
installSignalOwnerEnvironment({
	current: () => requests.getStore()?.owner ?? null,
	run: (owner, callback) => requests.run({ ...requests.getStore()!, owner }, callback),
	capture: (owner) => {
		const request = requests.getStore()!.request;
		return (callback) => requests.run({ request, owner }, callback);
	},
});
