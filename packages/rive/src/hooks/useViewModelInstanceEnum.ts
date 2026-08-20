import { useCallback } from 'octane';
import type { ViewModelInstance, ViewModelInstanceEnum } from '@rive-app/canvas';
import type { UseViewModelInstanceEnumResult } from '../types.ts';
import { useViewModelInstanceProperty } from './useViewModelInstanceProperty.ts';
import { splitSlot, subSlot } from '../internal.ts';

/**
 * Hook for interacting with enum properties of a ViewModelInstance.
 *
 * @param params - Parameters for interacting with enum properties
 * @param params.path - Path to the enum property (e.g. "state" or "group/state")
 * @param params.viewModelInstance - The ViewModelInstance containing the enum property
 * @returns An object with the enum value, available values, and a setter function
 */
export default function useViewModelInstanceEnum(
	...rawArgs: unknown[]
): UseViewModelInstanceEnumResult {
	const [args, slot] = splitSlot(rawArgs);
	const path = args[0] as string;
	const viewModelInstance = args[1] as ViewModelInstance | null | undefined;

	const getProperty = useCallback(
		function readProperty(vm: ViewModelInstance, p: string) {
			return vm.enum(p);
		},
		[],
		subSlot(slot, 'getProperty'),
	);
	const getValue = useCallback(
		function readValue(prop: ViewModelInstanceEnum) {
			return prop.value;
		},
		[],
		subSlot(slot, 'getValue'),
	);
	const getExtendedData = useCallback(
		function readValues(prop: ViewModelInstanceEnum) {
			return prop.values;
		},
		[],
		subSlot(slot, 'extended'),
	);
	const buildPropertyOperations = useCallback(
		function buildOps(
			safePropertyAccess: (callback: (prop: ViewModelInstanceEnum) => void) => void,
		) {
			return {
				setValue: function setValue(newValue: string) {
					safePropertyAccess(function assign(prop) {
						prop.value = newValue;
					});
				},
			};
		},
		[],
		subSlot(slot, 'buildOps'),
	);

	const result = useViewModelInstanceProperty<
		ViewModelInstanceEnum,
		string,
		Omit<UseViewModelInstanceEnumResult, 'value' | 'values'>,
		string[]
	>(
		path,
		viewModelInstance,
		{
			getProperty: getProperty,
			getValue: getValue,
			defaultValue: null,
			getExtendedData: getExtendedData,
			buildPropertyOperations: buildPropertyOperations,
		},
		subSlot(slot, 'prop'),
	);

	return {
		value: result.value,
		values: result.extendedData || [],
		setValue: result.setValue,
	};
}
