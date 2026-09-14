// Adapted from react-hook-form@7.88.0 src/utils/isPlainObject.ts for Octane.
import isObject from './isObject';

export default (tempObject: object) => {
	const prototypeCopy = tempObject.constructor && tempObject.constructor.prototype;

	return isObject(prototypeCopy) && prototypeCopy.hasOwnProperty('isPrototypeOf');
};
