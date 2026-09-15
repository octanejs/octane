// Adapted from react-hook-form@7.88.0 src/utils/insert.ts for Octane.
import convertToArrayPayload from './convertToArrayPayload';

export default function insert<T>(data: T[], index: number): (T | undefined)[];
export default function insert<T>(data: T[], index: number, value: T | T[]): T[];
export default function insert<T>(data: T[], index: number, value?: T | T[]): (T | undefined)[] {
	return [...data.slice(0, index), ...convertToArrayPayload(value), ...data.slice(index)];
}
