// Adapted from react-hook-form@7.88.0 src/utils/fillEmptyArray.ts for Octane.
export default <T>(value: T | T[]): undefined[] | undefined =>
	Array.isArray(value) ? value.map(() => undefined) : undefined;
