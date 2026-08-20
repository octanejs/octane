import { useCallback } from 'octane';
import type { ViewModelInstance, ViewModelInstanceAssetFont } from '@rive-app/canvas';
import type { RiveDecodedFont, UseViewModelInstanceFontResult } from '../types.ts';
import { useViewModelInstanceProperty } from './useViewModelInstanceProperty.ts';
import { splitSlot, subSlot } from '../internal.ts';

/**
 * Hook for interacting with font properties of a ViewModelInstance.
 *
 * @param path - Path to the font property (e.g. "boundFont" or "group/titleFont")
 * @param viewModelInstance - The ViewModelInstance containing the font property
 * @returns An object with a setter function to set a new font value
 */
export default function useViewModelInstanceFont(
	...rawArgs: unknown[]
): UseViewModelInstanceFontResult {
	const [args, slot] = splitSlot(rawArgs);
	const path = args[0] as string;
	const viewModelInstance = args[1] as ViewModelInstance | null | undefined;

	const getProperty = useCallback(
		function readProperty(vm: ViewModelInstance, p: string) {
			return vm.font(p);
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
			safePropertyAccess: (callback: (prop: ViewModelInstanceAssetFont) => void) => void,
		) {
			return {
				setValue: function setValue(newValue: RiveDecodedFont | null) {
					safePropertyAccess(function assign(prop) {
						// TODO: Can remove the type assertion once JS has value setter with FontWrapper
						prop.value = newValue as unknown as typeof prop.value;
					});
				},
			};
		},
		[],
		subSlot(slot, 'buildOps'),
	);

	const result = useViewModelInstanceProperty<
		ViewModelInstanceAssetFont,
		undefined,
		UseViewModelInstanceFontResult
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
