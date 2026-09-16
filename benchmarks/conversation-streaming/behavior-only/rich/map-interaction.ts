/** Deterministic fixture controls. This chunk is not a production map SDK. */
export function zoom(direction: 'in' | 'out'): string {
	return direction === 'in' ? '20 10 60 30' : '0 0 100 50';
}
