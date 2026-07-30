import { ObservableInput, OperatorFunction, ObservedValueOf, pipe } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { suspend } from './suspend';
import { SUSPENSE } from '@rx-state/core';

/**
 * Same behaviour as rxjs' `switchMap`, but prepending every new event with
 * SUSPENSE.
 *
 * @param fn Projection function
 */
export const switchMapSuspended = <T, O extends ObservableInput<any>>(
	project: (value: T, index: number) => O,
): OperatorFunction<T, ObservedValueOf<O> | typeof SUSPENSE> =>
	pipe(switchMap((x, index) => suspend(project(x, index))));
