import type { AxisScale } from '@octanejs/visx/axis';
import { useMemo, useRef, useState } from 'octane';
import DataRegistry from '../classes/DataRegistry';
import type { DataContextType, DataRegistryEntry } from '../types';

/** Hook that returns an API equivalent to DataRegistry but which updates as needed for use as a hook. */
export default function useDataRegistry<XScale extends AxisScale, YScale extends AxisScale, Datum extends object>(
	initialEntries: DataRegistryEntry<XScale, YScale, Datum>[] = [],
): DataContextType<XScale, YScale, Datum>['dataRegistry'] {
	const [, forceUpdate] = useState(0);
	const privateRegistry = useMemo(() => new DataRegistry<XScale, YScale, Datum>(), []);
	const initialKeysRef = useRef<string[]>([]);

	const initialKeys = initialEntries.map((entry) => entry.key);
	const currentKeySet = new Set(initialKeys);
	const removedKeys = initialKeysRef.current.filter((key) => !currentKeySet.has(key));
	if (removedKeys.length > 0) privateRegistry.unregisterData(removedKeys);
	if (initialEntries.length > 0) privateRegistry.registerData(initialEntries);
	initialKeysRef.current = initialKeys;

	return useMemo(
		() => ({
			registerData: (
				...params: Parameters<DataContextType<XScale, YScale, Datum>['dataRegistry']['registerData']>
			) => {
				privateRegistry.registerData(...params);
				forceUpdate((version) => version + 1);
			},
			unregisterData: (
				...params: Parameters<DataContextType<XScale, YScale, Datum>['dataRegistry']['unregisterData']>
			) => {
				privateRegistry.unregisterData(...params);
				forceUpdate((version) => version + 1);
			},
			entries: () => privateRegistry.entries(),
			get: (key: string) => privateRegistry.get(key),
			keys: () => privateRegistry.keys(),
		}),
		[privateRegistry],
	);
}
