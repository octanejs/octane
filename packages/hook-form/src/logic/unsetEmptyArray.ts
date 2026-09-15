// Adapted from react-hook-form@7.88.0 src/logic/unsetEmptyArray.ts for Octane.
import compact from '../utils/compact';
import get from '../utils/get';
import unset from '../utils/unset';

export default <T>(ref: T, name: string) => {
	const array = get(ref, name);

	!compact(array).length && !(array as { root?: unknown })?.root && unset(ref, name);
};
