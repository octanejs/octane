import { useInsertionEffect } from 'octane';

function useSharedInsertion(label: string, log: (entry: string) => void): void {
	useInsertionEffect(() => {
		log('insertion shared mount:' + label);
		return () => log('insertion shared cleanup:' + label);
	}, [label, log]);
}

// A plain-TypeScript loop repeats one custom-hook call site, so both enqueues
// share one effective slot. Both bodies must remain observable when a completed
// memo child survives suspension.
export function useRepeatedSharedInsertions(log: (entry: string) => void): void {
	for (const label of ['first', 'second']) useSharedInsertion(label, log);
}
