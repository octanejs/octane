// Vendored from react-hook-form@7.81.0 src/utils/append.ts (octane port).
import convertToArrayPayload from './convertToArrayPayload';

export default <T>(data: T[], value: T | T[]): T[] => [...data, ...convertToArrayPayload(value)];
