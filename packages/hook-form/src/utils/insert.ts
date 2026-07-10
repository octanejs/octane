// Vendored from react-hook-form@7.81.0 src/utils/insert.ts (octane port).
import convertToArrayPayload from './convertToArrayPayload';

export default function insert<T>(data: T[], index: number): (T | undefined)[];
export default function insert<T>(data: T[], index: number, value: T | T[]): T[];
export default function insert<T>(data: T[], index: number, value?: T | T[]): (T | undefined)[] {
	return [...data.slice(0, index), ...convertToArrayPayload(value), ...data.slice(index)];
}
