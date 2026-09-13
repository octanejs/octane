import { useRef, useState } from 'octane';

export function useMap<T, V>(initialState?: [T, V][]): Map<T, V> {
	const normalizedInitialState = typeof initialState === 'symbol' ? undefined : initialState;
	const [map, setMap] = useState(() => new Map<T, V>(normalizedInitialState));
	const mapRef = useRef(map);
	mapRef.current = map;

	map.set = (...args) => {
		Map.prototype.set.apply(mapRef.current, args);
		setMap(new Map(mapRef.current));
		return mapRef.current;
	};

	map.clear = (...args) => {
		Map.prototype.clear.apply(mapRef.current, args);
		setMap(new Map(mapRef.current));
	};

	map.delete = (...args) => {
		const res = Map.prototype.delete.apply(mapRef.current, args);
		setMap(new Map(mapRef.current));

		return res;
	};

	return map;
}
