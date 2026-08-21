import { useInsertionEffect } from 'octane';

function useSharedInsertion(label: string, log: (entry: string) => void): void {
	useInsertionEffect(() => {
		log('insertion shared mount:' + label);
		return () => log('insertion shared cleanup:' + label);
	}, [label, log]);
}

// Plain-TypeScript hook transforms slot the base hook but do not wrap these
// nested custom-hook calls. Both enqueues share one effective slot, and both
// bodies must remain observable when a completed memo child survives suspension.
export function useRepeatedSharedInsertions(log: (entry: string) => void): void {
	useSharedInsertion('first', log);
	useSharedInsertion('second', log);
}
