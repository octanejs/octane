// Vendored from react-hook-form@7.81.0 src/utils/swap.ts (octane port).
export default <T>(data: T[], indexA: number, indexB: number): void => {
	[data[indexA], data[indexB]] = [data[indexB], data[indexA]];
};
