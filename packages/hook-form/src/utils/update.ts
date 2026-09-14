// Adapted from react-hook-form@7.88.0 src/utils/update.ts for Octane.
export default <T>(fieldValues: T[], index: number, value: T) => {
	fieldValues[index] = value;
	return fieldValues;
};
