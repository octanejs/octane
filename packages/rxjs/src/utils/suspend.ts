import { ObservableInput, from, Observable } from 'rxjs';
import { SUSPENSE } from '@rx-state/core';
import { defaultStart } from './internal-utils';

/**
 * A RxJS creation operator that prepends a SUSPENSE on the source observable.
 *
 * @param source$ Source observable
 */
export const suspend: <T>(source$: ObservableInput<T>) => Observable<T | typeof SUSPENSE> = <T>(
	source$: ObservableInput<T>,
) => defaultStart(SUSPENSE)(from(source$)) as any;
