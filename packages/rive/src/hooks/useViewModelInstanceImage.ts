import { useCallback } from 'octane';
import type { ViewModelInstance, ViewModelInstanceAssetImage } from '@rive-app/canvas';
import type { RiveRenderImage, UseViewModelInstanceImageResult } from '../types.ts';
import { useViewModelInstanceProperty } from './useViewModelInstanceProperty.ts';
import { splitSlot, subSlot } from '../internal.ts';

/**
 * Hook for interacting with image properties of a ViewModelInstance.
 *
 * @param path - Path to the image property (e.g. "profileImage" or "group/avatar")
 * @param viewModelInstance - The ViewModelInstance containing the image property
 * @returns An object with a setter function to set a new image value
 */
export default function useViewModelInstanceImage(
	...rawArgs: unknown[]
): UseViewModelInstanceImageResult {
	const [args, slot] = splitSlot(rawArgs);
	const path = args[0] as string;
	const viewModelInstance = args[1] as ViewModelInstance | null | undefined;

	const getProperty = useCallback(
		function readProperty(vm: ViewModelInstance, p: string) {
			return vm.image(p);
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
			safePropertyAccess: (callback: (prop: ViewModelInstanceAssetImage) => void) => void,
		) {
			return {
				setValue: function setValue(newValue: RiveRenderImage | null) {
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
		ViewModelInstanceAssetImage,
		undefined,
		UseViewModelInstanceImageResult
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
