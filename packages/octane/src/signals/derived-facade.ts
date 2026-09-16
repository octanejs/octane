import { createDeclaredDerivedCell } from './computations.js';
import { DerivedDescriptor, descriptorKey } from './facade.js';
import { runWithSignalOwner } from './owner-context.js';
import type { DerivedCompute, DerivedOptions, DerivedSignal } from './types.js';

// General derived values may start async work. Scalar compiler output imports
// only the shared facade, even when a separate cold entry uses this factory.
export function __derivedAt<T>(
	site: string,
	compute: DerivedCompute<T>,
	options?: DerivedOptions,
): DerivedSignal<T>;
export function __derivedAt<T>(
	site: string,
	key: string,
	compute: DerivedCompute<T>,
	options?: DerivedOptions,
): DerivedSignal<T>;
export function __derivedAt<T>(
	site: string,
	keyOrCompute: string | DerivedCompute<T>,
	computeOrOptions?: DerivedCompute<T> | DerivedOptions,
	options?: DerivedOptions,
): DerivedSignal<T> {
	const explicit = typeof keyOrCompute === 'string' ? keyOrCompute : undefined;
	const compute = (explicit ? computeOrOptions : keyOrCompute) as DerivedCompute<T>;
	const resolvedOptions = (explicit ? options : computeOrOptions) as DerivedOptions | undefined;
	if (typeof compute !== 'function') throw new TypeError('derived$ requires a function.');
	const key = descriptorKey(site, explicit);
	return new DerivedDescriptor(
		key,
		'derived',
		(owner) => {
			const wrapped = compute.length
				? (context: Parameters<DerivedCompute<T>>[0]) =>
						runWithSignalOwner(owner, () => compute(context))
				: () => runWithSignalOwner(owner, () => (compute as () => ReturnType<DerivedCompute<T>>)());
			return createDeclaredDerivedCell(owner, key, wrapped, resolvedOptions);
		},
		site,
	);
}

export function derived$<T>(compute: DerivedCompute<T>, options?: DerivedOptions): DerivedSignal<T>;
export function derived$<T>(
	key: string,
	compute: DerivedCompute<T>,
	options?: DerivedOptions,
): DerivedSignal<T>;
export function derived$<T>(
	keyOrCompute: string | DerivedCompute<T>,
	computeOrOptions?: DerivedCompute<T> | DerivedOptions,
	options?: DerivedOptions,
): DerivedSignal<T> {
	return typeof keyOrCompute === 'string'
		? __derivedAt(keyOrCompute, keyOrCompute, computeOrOptions as DerivedCompute<T>, options)
		: __derivedAt(undefined as never, keyOrCompute, computeOrOptions as DerivedOptions | undefined);
}
