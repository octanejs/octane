import { formatClientError } from '../error-codes.client.generated.js';
import { createDeclaredDerivedCell } from './computations.js';
import { signalDeclarationSequence } from './engine.js';
import { declarationKey, DerivedDescriptor, descriptorKey, signalOptionsKey } from './facade.js';
import { runWithSignalOwner } from './owner-context.js';
import type { DerivedCompute, DerivedOptions, DerivedSignal, SignalOptions } from './types.js';

// General derived values may start async work. Scalar compiler output imports
// only the shared facade, even when a separate cold entry uses this factory.
// The compiler lists the render values `compute` captures; a render that
// captured the committed values keeps the committed computation.
export function __derivedAt<T>(
	site: string | undefined,
	compute: DerivedCompute<T>,
	options?: DerivedOptions & SignalOptions,
	captures?: readonly unknown[],
): DerivedSignal<T> {
	if (typeof compute !== 'function') throw new TypeError(formatClientError(122));
	const explicit = signalOptionsKey(options);
	site ??= explicit;
	const key = declarationKey(site, descriptorKey(site, explicit));
	// A render that declares this site again may capture new values in compute.
	const sequence = signalDeclarationSequence(site);
	return new DerivedDescriptor(
		key,
		'derived',
		(owner, declaring) => {
			const wrapped = compute.length
				? (context: Parameters<DerivedCompute<T>>[0]) =>
						runWithSignalOwner(owner, () => compute(context))
				: () => runWithSignalOwner(owner, () => (compute as () => ReturnType<DerivedCompute<T>>)());
			return createDeclaredDerivedCell(owner, key, wrapped, options, sequence, captures, declaring);
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
