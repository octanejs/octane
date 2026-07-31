import { suspend } from './suspend';
import { OperatorFunction } from 'rxjs';
import { SUSPENSE } from '@rx-state/core';

/**
 * A RxJS pipeable operator that prepends a SUSPENSE on the source observable.
 */
export const suspended = <T>(): OperatorFunction<T, T | typeof SUSPENSE> => suspend;
