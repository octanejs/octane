// Adapted from react-hook-form@7.88.0 src/utils/isRegex.ts for Octane.
export default (value: unknown): value is RegExp => value instanceof RegExp;
