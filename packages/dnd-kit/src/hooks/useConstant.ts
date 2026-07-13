import { useRef } from 'octane';

export function useConstant<T = any>(initializer: () => T, slot?: symbol): T {
	const ref = useRef<T | null>(null, slot);
	if (ref.current === null) ref.current = initializer();
	return ref.current;
}
