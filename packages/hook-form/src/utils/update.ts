// Vendored from react-hook-form@7.81.0 src/utils/update.ts (octane port).
export default <T>(fieldValues: T[], index: number, value: T) => {
	fieldValues[index] = value;
	return fieldValues;
};
