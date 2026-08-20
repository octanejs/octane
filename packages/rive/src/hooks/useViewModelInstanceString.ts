import { useCallback } from 'octane';
import type { ViewModelInstance, ViewModelInstanceString } from '@rive-app/canvas';
import type { UseViewModelInstanceStringResult } from '../types.ts';
import { useViewModelInstanceProperty } from './useViewModelInstanceProperty.ts';
import { splitSlot, subSlot } from '../internal.ts';

/**
 * Hook for interacting with string properties of a ViewModelInstance.
 *
 * @param params - Parameters for interacting with string properties
 * @param params.path - Path to the property (e.g. "text" or "nested/text")
 * @param params.viewModelInstance - The ViewModelInstance containing the string property
 * @returns An object with the string value and a setter function
 */
export default function useViewModelInstanceString(
	...rawArgs: unknown[]
): UseViewModelInstanceStringResult {
	const [args, slot] = splitSlot(rawArgs);
	const path = args[0] as string;
	const viewModelInstance = args[1] as ViewModelInstance | null | undefined;

	const getProperty = useCallback(
		function readProperty(vm: ViewModelInstance, p: string) {
			return vm.string(p);
		},
		[],
		subSlot(slot, 'getProperty'),
	);
	const getValue = useCallback(
		function readValue(prop: ViewModelInstanceString) {
			return prop.value;
		},
		[],
		subSlot(slot, 'getValue'),
	);
	const buildPropertyOperations = useCallback(
		function buildOps(
			safePropertyAccess: (callback: (prop: ViewModelInstanceString) => void) => void,
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
		ViewModelInstanceString,
		string,
		Omit<UseViewModelInstanceStringResult, 'value'>
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
