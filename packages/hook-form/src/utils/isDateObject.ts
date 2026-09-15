// Adapted from react-hook-form@7.88.0 src/utils/isDateObject.ts for Octane.
export default (value: unknown): value is Date => value instanceof Date;
