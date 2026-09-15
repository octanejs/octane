// Adapted from react-hook-form@7.88.0 src/utils/compact.ts for Octane.
export default <TValue>(value: TValue[]) => (Array.isArray(value) ? value.filter(Boolean) : []);
