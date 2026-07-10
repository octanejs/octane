// Vendored from react-hook-form@7.81.0 src/utils/isPlainObject.ts (octane port).
import isObject from './isObject';

export default (tempObject: object) => {
	const prototypeCopy = tempObject.constructor && tempObject.constructor.prototype;

	return isObject(prototypeCopy) && prototypeCopy.hasOwnProperty('isPrototypeOf');
};
