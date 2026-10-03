import { useCallback, useEffect, useMemo } from 'octane';

export function useExternalEffect(value: string, log: (entry: string) => void) {
	useEffect(() => {
		log(`run:${value}`);
		return () => log(`cleanup:${value}`);
	});
}

export function useExternalMemo(value: string, compute: (value: string) => string): string {
	return useMemo(() => compute(value));
}

export function useExternalLaterLabel(prefix: string, log: (entry: string) => void): string {
	useEffect(() => log(`run:${label}`));
	const read = useCallback(() => label);
	const reader = useMemo(() => ({ read: () => label }));
	const label = prefix.toUpperCase();
	return `${read()}/${reader.read()}`;
}
