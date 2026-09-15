// Adapted from react-hook-form@7.88.0 src/utils/isNullOrUndefined.ts for Octane.
export default (value: unknown): value is null | undefined => value == null;
