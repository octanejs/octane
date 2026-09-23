import { createContext } from 'octane';

// Hook-free plain module: an unused module-scope context next to a pure helper.
export const UnusedContext = createContext({ label: 'unused' });

export function double(value: number): number {
	return value * 2;
}
