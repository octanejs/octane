import { useRef, useEffect } from 'octane';

export function usePrevious<T>(value: T) {
	const ref = useRef<T>();

	useEffect(() => {
		ref.current = value;
	}, [value]);

	return ref.current;
}
