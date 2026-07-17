// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/utils/chain.ts).

/**
 * Calls all functions in the order they were chained with the same arguments.
 */
export function chain(...callbacks: any[]): (...args: any[]) => void {
	return (...args: any[]) => {
		for (let callback of callbacks) {
			if (typeof callback === 'function') {
				callback(...args);
			}
		}
	};
}
