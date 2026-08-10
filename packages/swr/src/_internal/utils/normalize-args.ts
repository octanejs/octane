import { isFunction } from './shared.js';

import type { Key, Fetcher, SWRConfiguration } from '../types.js';

export const normalize = <KeyType = Key, Data = any>(
	args:
		| [KeyType]
		| [KeyType, Fetcher<Data> | null]
		| [KeyType, SWRConfiguration | undefined]
		| [KeyType, Fetcher<Data> | null, SWRConfiguration | undefined],
): [KeyType, Fetcher<Data> | null, Partial<SWRConfiguration<Data>>] => {
	// The Octane compiler appends a call-site slot to hooks. It is runtime
	// metadata, not SWR's optional configuration argument.
	const userArgs = (
		typeof args[args.length - 1] === 'symbol' ? args.slice(0, -1) : args
	) as typeof args;

	return isFunction(userArgs[1])
		? [userArgs[0], userArgs[1], userArgs[2] || {}]
		: [userArgs[0], null, (userArgs[1] === null ? userArgs[2] : userArgs[1]) || {}];
};
