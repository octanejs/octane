// Adapted from react-hook-form@7.88.0 src/utils/append.ts for Octane.
import convertToArrayPayload from './convertToArrayPayload';

export default <T>(data: T[], value: T | T[]): T[] => [...data, ...convertToArrayPayload(value)];
