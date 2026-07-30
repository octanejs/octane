import { merge, Observable, ObservableInput, from, SchedulerLike } from 'rxjs';
import { map } from 'rxjs/operators';

/**
 * Emits the values from all the streams of the provided object, in a result
 * which provides the key of the stream of that emission.
 *
 * @param input object of streams
 */
export const mergeWithKey: <
	O extends { [P in keyof any]: ObservableInput<any> },
	OT extends {
		[K in keyof O]: O[K] extends ObservableInput<infer V> ? { type: K; payload: V } : unknown;
	},
>(
	x: O,
	concurrent?: number,
	scheduler?: SchedulerLike,
) => Observable<OT[keyof O]> = (input, ...optionalArgs) =>
	merge<any[]>(
		...(Object.entries(input)
			.map(
				([type, stream]) => from(stream).pipe(map((payload) => ({ type, payload }) as any)) as any,
			)
			.concat(optionalArgs) as any[]),
	);
