import { useEffect, useMemo } from 'octane';

export function useExternalEffect(value: string, log: (entry: string) => void) {
	useEffect(() => {
		log(`run:${value}`);
		return () => log(`cleanup:${value}`);
	});
}

export function useExternalMemo(value: string, compute: (value: string) => string): string {
	return useMemo(() => compute(value));
}
