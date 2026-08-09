import { useEffect, useMemo, useRef } from 'octane';
import { splitSlot, subSlot } from './internal';

type Entry = { _tag: 'active'; rc: number; resource: unknown } | { _tag: 'destroyed' };
type Bucket = Map<string, Entry>;

let scopedBuckets = new WeakMap<object, Bucket>();

const getBucket = (scope: object): Bucket => {
	let bucket = scopedBuckets.get(scope);
	if (bucket === undefined) {
		bucket = new Map();
		scopedBuckets.set(scope, bucket);
	}
	return bucket;
};

export function useRcResource<T>(
	scope: object,
	key: string,
	create: () => T,
	dispose: (resource: NoInfer<T>) => void,
	options?: { debugPrint?: (resource: NoInfer<T>) => ReadonlyArray<unknown> },
): T;
export function useRcResource<T>(
	scope: object,
	key: string,
	create: () => T,
	dispose: (resource: NoInfer<T>) => void,
	options: { debugPrint?: (resource: NoInfer<T>) => ReadonlyArray<unknown> } | undefined,
	slot: symbol,
): T;
export function useRcResource<T>(
	scope: object,
	key: string,
	create: () => T,
	dispose: (resource: NoInfer<T>) => void,
	...rest: [
		options?: { debugPrint?: (resource: NoInfer<T>) => ReadonlyArray<unknown> },
		slot?: symbol,
	]
): T {
	const [args, slot] = splitSlot(rest);
	void args[0];

	const heldRef = useRef<{ scope: object; key: string; resource: T } | undefined>(
		undefined,
		subSlot(slot, 'rc:held'),
	);
	const createRef = useRef(create, subSlot(slot, 'rc:create'));
	const disposeRef = useRef(dispose, subSlot(slot, 'rc:dispose'));

	createRef.current = create;
	disposeRef.current = dispose;

	const release = (held: { scope: object; key: string; resource: T }) => {
		const bucket = getBucket(held.scope);
		const cachedItem = bucket.get(held.key);
		if (cachedItem?._tag !== 'active') return;
		cachedItem.rc--;
		if (cachedItem.rc === 0) {
			disposeRef.current(cachedItem.resource as T);
			bucket.delete(held.key);
		}
	};

	const resource = useMemo(
		() => {
			const previous = heldRef.current;
			if (previous !== undefined) release(previous);

			const bucket = getBucket(scope);
			const cachedItem = bucket.get(key);
			let next: T;
			if (cachedItem?._tag === 'active') {
				cachedItem.rc++;
				next = cachedItem.resource as T;
			} else {
				next = createRef.current();
				bucket.set(key, { _tag: 'active', rc: 1, resource: next });
			}

			heldRef.current = { scope, key, resource: next };
			return next;
		},
		[scope, key],
		subSlot(slot, 'rc:memo'),
	);

	useEffect(
		() => {
			const held = heldRef.current;
			return () => {
				if (held !== undefined && heldRef.current === held) {
					release(held);
					heldRef.current = undefined;
				}
			};
		},
		[scope, key],
		subSlot(slot, 'rc:effect'),
	);

	return resource;
}

export const __resetUseRcResourceCache = (): void => {
	scopedBuckets = new WeakMap();
};
