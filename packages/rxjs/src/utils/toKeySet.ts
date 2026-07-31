import { Observable, OperatorFunction } from 'rxjs';
import { KeyChanges } from './partitionByKey';

/**
 * Operator function that maps a stream of KeyChanges into a Set that contains
 * the active keys.
 */
export function toKeySet<K>(): OperatorFunction<KeyChanges<K>, Set<K>> {
	return (source$) =>
		new Observable<Set<K>>((observer) => {
			const result = new Set<K>();
			let pristine = true;
			const subscription = source$.subscribe({
				next({ type, keys }) {
					const action = type === 'add' ? type : 'delete';
					for (let k of keys) {
						result[action](k);
					}
					observer.next(result);
					pristine = false;
				},
				error(e) {
					observer.error(e);
				},
				complete() {
					observer.complete();
				},
			});
			if (pristine) observer.next(result);
			return subscription;
		});
}
