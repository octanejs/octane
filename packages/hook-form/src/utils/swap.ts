// Adapted from react-hook-form@7.88.0 src/utils/swap.ts for Octane.
export default <T>(data: T[], indexA: number, indexB: number): void => {
	[data[indexA], data[indexB]] = [data[indexB], data[indexA]];
};
