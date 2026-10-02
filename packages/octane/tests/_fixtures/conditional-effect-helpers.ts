import { useEffect } from 'octane';

function useSharedEffect(label: string, log: string[]): void {
	useEffect(() => {
		log.push('shared:create:' + label);
		return () => log.push('shared:cleanup:' + label);
	}, [label, log]);
}

// A plain-TypeScript loop repeats one custom-hook call site. Both invocations
// therefore enqueue through the same effective runtime slot and must remain
// independently observable.
export function useRepeatedSharedEffects(log: string[]): void {
	for (const label of ['first', 'second']) useSharedEffect(label, log);
}
