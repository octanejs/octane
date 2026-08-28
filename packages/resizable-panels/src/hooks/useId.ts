import { useId as useOctaneId } from 'octane';

export function useId(stableId: number | string | undefined, slot?: symbol): string {
	const dynamicId = useOctaneId(slot);
	return `${stableId ?? dynamicId}`;
}
