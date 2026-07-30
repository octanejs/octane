import { ReplaySubject, share } from 'rxjs';
import type { MonoTypeOperatorFunction } from 'rxjs';

export const shareLatest = <T>(): MonoTypeOperatorFunction<T> =>
	share<T>({
		connector: () => new ReplaySubject<T>(1),
		resetOnError: true,
		resetOnComplete: true,
		resetOnRefCountZero: true,
	});
