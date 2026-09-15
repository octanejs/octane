// Adapted from react-hook-form@7.88.0 src/utils/convertToArrayPayload.ts for Octane.
export default <T>(value: T) => (Array.isArray(value) ? value : [value]);
