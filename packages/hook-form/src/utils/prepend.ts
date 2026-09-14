// Adapted from react-hook-form@7.88.0 src/utils/prepend.ts for Octane.
import convertToArrayPayload from './convertToArrayPayload';

export default <T>(data: T[], value: T | T[]): T[] => [
	...convertToArrayPayload(value),
	...convertToArrayPayload(data),
];
