// Vendored from react-hook-form@7.81.0 src/utils/fillEmptyArray.ts (octane port).
export default <T>(value: T | T[]): undefined[] | undefined =>
	Array.isArray(value) ? value.map(() => undefined) : undefined;
