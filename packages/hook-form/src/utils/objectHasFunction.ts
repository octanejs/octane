// Adapted from react-hook-form@7.88.0 src/utils/objectHasFunction.ts for Octane.
import isFunction from './isFunction';

export default <T>(data: T): boolean => {
	for (const key in data) {
		if (isFunction(data[key])) {
			return true;
		}
	}
	return false;
};
