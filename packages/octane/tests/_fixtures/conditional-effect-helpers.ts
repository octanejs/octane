import { useEffect } from 'octane';

function useSharedEffect(label: string, log: string[]): void {
	useEffect(() => {
		log.push('shared:create:' + label);
		return () => log.push('shared:cleanup:' + label);
	}, [label, log]);
}

// The surgical plain-TypeScript transform slots the base hook, but does not
// wrap nested custom-hook calls. Both invocations therefore enqueue through the
// same effective runtime slot and must remain independently observable.
export function useRepeatedSharedEffects(log: string[]): void {
	useSharedEffect('first', log);
	useSharedEffect('second', log);
}
