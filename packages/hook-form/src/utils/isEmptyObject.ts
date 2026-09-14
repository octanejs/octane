// Adapted from react-hook-form@7.88.0 src/utils/isEmptyObject.ts for Octane.
import type { EmptyObject } from '../types';

import isObject from './isObject';

export default (value: unknown): value is EmptyObject =>
	isObject(value) && !Object.keys(value).length;
