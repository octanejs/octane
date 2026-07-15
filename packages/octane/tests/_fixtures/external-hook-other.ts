import { useState } from 'octane';

// Deliberately the first hook site in a separate plain-TS module. Production
// slots must reserve disjoint module ranges; a local-only `0` would
// collide with useExternalCounter's first state cell when both run under the
// same outer custom-hook path.
export function useOtherCounter(start: number) {
	return useState(start);
}
