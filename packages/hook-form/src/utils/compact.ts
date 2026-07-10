// Vendored from react-hook-form@7.81.0 src/utils/compact.ts (octane port).
export default <TValue>(value: TValue[]) => (Array.isArray(value) ? value.filter(Boolean) : []);
