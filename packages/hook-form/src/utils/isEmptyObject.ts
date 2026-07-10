// Vendored from react-hook-form@7.81.0 src/utils/isEmptyObject.ts (octane port).
import type { EmptyObject } from '../types';

import isObject from './isObject';

export default (value: unknown): value is EmptyObject =>
	isObject(value) && !Object.keys(value).length;
