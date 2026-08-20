import { useCallback } from 'octane';
import type { ViewModelInstance, ViewModelInstanceBoolean } from '@rive-app/canvas';
import type { UseViewModelInstanceBooleanResult } from '../types.ts';
import { useViewModelInstanceProperty } from './useViewModelInstanceProperty.ts';
import { splitSlot, subSlot } from '../internal.ts';

/**
 * Hook for interacting with boolean ViewModel instance properties.
 *
 * @param path - The path to the boolean property
 * @param viewModelInstance - The ViewModelInstance containing the boolean property to operate on
 * @returns An object with the boolean value and a setter function
 */
export default function useViewModelInstanceBoolean(
	...rawArgs: unknown[]
): UseViewModelInstanceBooleanResult {
	const [args, slot] = splitSlot(rawArgs);
	const path = args[0] as string;
	const viewModelInstance = args[1] as ViewModelInstance | null | undefined;

	const getProperty = useCallback(
		function readProperty(vm: ViewModelInstance, p: string) {
			return vm.boolean(p);
		},
		[],
		subSlot(slot, 'getProperty'),
	);
	const getValue = useCallback(
		function readValue(prop: ViewModelInstanceBoolean) {
			return prop.value;
		},
		[],
		subSlot(slot, 'getValue'),
	);
	const buildPropertyOperations = useCallback(
		function buildOps(
			safePropertyAccess: (callback: (prop: ViewModelInstanceBoolean) => void) => void,
		) {
			return {
				setValue: function setValue(newValue: boolean) {
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
		ViewModelInstanceBoolean,
		boolean,
		Omit<UseViewModelInstanceBooleanResult, 'value'>
	>(
		path,
		viewModelInstance,
		{
			getProperty: getProperty,
			getValue: getValue,
			defaultValue: null,
			buildPropertyOperations: buildPropertyOperations,
		},
		subSlot(slot, 'prop'),
	);

	return {
		value: result.value,
		setValue: result.setValue,
	};
}
