// Vendored from react-hook-form@7.81.0 src/utils/objectHasFunction.ts (octane port).
import isFunction from './isFunction';

export default <T>(data: T): boolean => {
	for (const key in data) {
		if (isFunction(data[key])) {
			return true;
		}
	}
	return false;
};
