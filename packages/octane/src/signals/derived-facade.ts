import { createDeclaredDerivedCell } from './computations.js';
import { DerivedDescriptor, descriptorKey, signalOptionsKey } from './facade.js';
import { runWithSignalOwner } from './owner-context.js';
import type { DerivedCompute, DerivedOptions, DerivedSignal, SignalOptions } from './types.js';

// General derived values may start async work. Scalar compiler output imports
// only the shared facade, even when a separate cold entry uses this factory.
export function __derivedAt<T>(
	site: string | undefined,
	compute: DerivedCompute<T>,
	options?: DerivedOptions & SignalOptions,
): DerivedSignal<T> {
	if (typeof compute !== 'function') throw new TypeError('derived$ requires a function.');
	const explicit = signalOptionsKey(options);
	site ??= explicit;
	const key = descriptorKey(site, explicit);
	return new DerivedDescriptor(
		key,
		'derived',
		(owner) => {
			const wrapped = compute.length
				? (context: Parameters<DerivedCompute<T>>[0]) =>
						runWithSignalOwner(owner, () => compute(context))
				: () => runWithSignalOwner(owner, () => (compute as () => ReturnType<DerivedCompute<T>>)());
			return createDeclaredDerivedCell(owner, key, wrapped, options);
		},
		site,
	);
}

export function derived$<T>(
	compute: DerivedCompute<T>,
	options?: DerivedOptions & SignalOptions,
): DerivedSignal<T> {
	return __derivedAt(undefined, compute, options);
}
