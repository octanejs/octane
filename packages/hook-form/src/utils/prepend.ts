// Vendored from react-hook-form@7.81.0 src/utils/prepend.ts (octane port).
import convertToArrayPayload from './convertToArrayPayload';

export default <T>(data: T[], value: T | T[]): T[] => [
	...convertToArrayPayload(value),
	...convertToArrayPayload(data),
];
