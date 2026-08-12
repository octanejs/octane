import type { SWRInfiniteKeyLoader } from './types.js';
import { serialize } from '../_internal/utils/serialize.js';
import { INFINITE_PREFIX } from '../_internal/constants.js';

export const getFirstPageKey = (getKey: SWRInfiniteKeyLoader) => {
	return serialize(getKey ? getKey(0, null) : null)[0];
};

export const unstable_serialize = (getKey: SWRInfiniteKeyLoader) => {
	return INFINITE_PREFIX + getFirstPageKey(getKey);
};
