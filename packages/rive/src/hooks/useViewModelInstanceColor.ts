import { useCallback } from 'octane';
import type { ViewModelInstance, ViewModelInstanceColor } from '@rive-app/canvas';
import type { UseViewModelInstanceColorResult } from '../types.ts';
import { useViewModelInstanceProperty } from './useViewModelInstanceProperty.ts';
import { splitSlot, subSlot } from '../internal.ts';

/**
 * Hook for interacting with color properties of a ViewModelInstance.
 *
 * @param path - Path to the color property
 * @param viewModelInstance - The ViewModelInstance containing the color property
 * @returns An object with the color value and setter functions for different color formats
 */
export default function useViewModelInstanceColor(
	...rawArgs: unknown[]
): UseViewModelInstanceColorResult {
	const [args, slot] = splitSlot(rawArgs);
	const path = args[0] as string;
	const viewModelInstance = args[1] as ViewModelInstance | null | undefined;

	const getProperty = useCallback(
		function readProperty(vm: ViewModelInstance, p: string) {
			return vm.color(p);
		},
		[],
		subSlot(slot, 'getProperty'),
	);
	const getValue = useCallback(
		function readValue(prop: ViewModelInstanceColor) {
			return prop.value;
		},
		[],
		subSlot(slot, 'getValue'),
	);
	const buildPropertyOperations = useCallback(
		function buildOps(
			safePropertyAccess: (callback: (prop: ViewModelInstanceColor) => void) => void,
		) {
			return {
				setValue: function setValue(newValue: number) {
					safePropertyAccess(function assign(prop) {
						prop.value = newValue;
					});
				},
				setRgb: function setRgb(r: number, g: number, b: number) {
					safePropertyAccess(function assign(prop) {
						prop.rgb(r, g, b);
					});
				},
				setRgba: function setRgba(r: number, g: number, b: number, a: number) {
					safePropertyAccess(function assign(prop) {
						prop.rgba(r, g, b, a);
					});
				},
				setAlpha: function setAlpha(a: number) {
					safePropertyAccess(function assign(prop) {
						prop.alpha(a);
					});
				},
				setOpacity: function setOpacity(o: number) {
					safePropertyAccess(function assign(prop) {
						prop.opacity(o);
					});
				},
			};
		},
		[],
		subSlot(slot, 'buildOps'),
	);

	const result = useViewModelInstanceProperty<
		ViewModelInstanceColor,
		number,
		Omit<UseViewModelInstanceColorResult, 'value'>
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
		setRgb: result.setRgb,
		setRgba: result.setRgba,
		setAlpha: result.setAlpha,
		setOpacity: result.setOpacity,
	};
}
