// Adapted from react-hook-form@7.88.0 src/utils/move.ts for Octane.
import isUndefined from './isUndefined';

export default <T>(data: (T | undefined)[], from: number, to: number): (T | undefined)[] => {
	if (!Array.isArray(data)) {
		return [];
	}

	if (isUndefined(data[to])) {
		data[to] = undefined;
	}
	data.splice(to, 0, data.splice(from, 1)[0]);

	return data;
};
