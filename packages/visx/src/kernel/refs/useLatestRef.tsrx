import { useRef } from 'octane';

export default function useLatestRef<T>(value: T) {
	const valueRef = useRef(value);
	valueRef.current = value;
	return valueRef;
}
