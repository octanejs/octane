import { useMemo } from 'octane';

export function useGreeting(name: string) {
	return useMemo(() => `Hello, ${name}!`);
}
