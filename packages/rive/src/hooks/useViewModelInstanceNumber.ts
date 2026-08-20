import { useCallback } from 'octane';
import type { ViewModelInstance, ViewModelInstanceNumber } from '@rive-app/canvas';
import type { UseViewModelInstanceNumberResult } from '../types.ts';
import { useViewModelInstanceProperty } from './useViewModelInstanceProperty.ts';
import { splitSlot, subSlot } from '../internal.ts';

/**
 * Hook for interacting with number properties of a ViewModelInstance.
 *
 * @param params - Parameters for interacting with number properties
 * @param params.path - Path to the number property (e.g. "speed" or "group/speed")
 * @param params.viewModelInstance - The ViewModelInstance containing the number property
 * @returns An object with the number value and a setter function
 */
export default function useViewModelInstanceNumber(
	...rawArgs: unknown[]
): UseViewModelInstanceNumberResult {
	const [args, slot] = splitSlot(rawArgs);
	const path = args[0] as string;
	const viewModelInstance = args[1] as ViewModelInstance | null | undefined;

	const getProperty = useCallback(
		function readProperty(vm: ViewModelInstance, p: string) {
			return vm.number(p);
		},
		[],
		subSlot(slot, 'getProperty'),
	);
	const getValue = useCallback(
		function readValue(prop: ViewModelInstanceNumber) {
			return prop.value;
		},
		[],
		subSlot(slot, 'getValue'),
	);
	const buildPropertyOperations = useCallback(
		function buildOps(
			safePropertyAccess: (callback: (prop: ViewModelInstanceNumber) => void) => void,
		) {
			return {
				setValue: function setValue(newValue: number) {
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
		ViewModelInstanceNumber,
		number,
		Omit<UseViewModelInstanceNumberResult, 'value'>
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
