import { useCallback } from 'octane';
import type { ViewModelInstance, ViewModelInstanceArtboard } from '@rive-app/canvas';
import type { UseViewModelInstanceArtboardResult } from '../types.ts';
import { useViewModelInstanceProperty } from './useViewModelInstanceProperty.ts';
import { splitSlot, subSlot } from '../internal.ts';

/**
 * Hook for interacting with artboard properties of a ViewModelInstance.
 *
 * @param path - Path to the artboard property (e.g. "targetArtboard" or "group/artboard")
 * @param viewModelInstance - The ViewModelInstance containing the artboard property
 * @returns An object with a setter function
 */
export default function useViewModelInstanceArtboard(
	...rawArgs: unknown[]
): UseViewModelInstanceArtboardResult {
	const [args, slot] = splitSlot(rawArgs);
	const path = args[0] as string;
	const viewModelInstance = args[1] as ViewModelInstance | null | undefined;

	const getProperty = useCallback(
		function readProperty(vm: ViewModelInstance, p: string) {
			return vm.artboard(p);
		},
		[],
		subSlot(slot, 'getProperty'),
	);
	const getValue = useCallback(
		function readValue() {
			return undefined;
		},
		[],
		subSlot(slot, 'getValue'),
	);
	const buildPropertyOperations = useCallback(
		function buildOps(
			safePropertyAccess: (callback: (prop: ViewModelInstanceArtboard) => void) => void,
		) {
			return {
				setValue: function setValue(
					newValue: UseViewModelInstanceArtboardResult['setValue'] extends (value: infer T) => void
						? T
						: never,
				) {
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
		ViewModelInstanceArtboard,
		undefined,
		UseViewModelInstanceArtboardResult
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
		setValue: result.setValue,
	};
}
