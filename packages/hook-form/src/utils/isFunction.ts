// Adapted from react-hook-form@7.88.0 src/utils/isFunction.ts for Octane.
export default (value: unknown): value is Function => typeof value === 'function';
