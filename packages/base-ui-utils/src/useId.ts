/** @jsxImportSource octane */
'use client';
import { useId as useOctaneId } from 'octane';

/** Returns an override or a stable, hydration-safe Octane ID with an optional prefix. */
export function useId(idOverride?: string, prefix?: string): string | undefined {
	const id = useOctaneId();
	return idOverride ?? (prefix ? `${prefix}-${id}` : id);
}
