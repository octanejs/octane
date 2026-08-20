import { useCallback, useState } from 'octane';
import type { ViewModelInstance, ViewModelInstanceList } from '@rive-app/canvas';
import type { UseViewModelInstanceListResult } from '../types.ts';
import { useViewModelInstanceProperty } from './useViewModelInstanceProperty.ts';
import { splitSlot, subSlot } from '../internal.ts';

/**
 * Hook for interacting with list properties of a ViewModelInstance.
 *
 * @param path - Path to the property (e.g. "items" or "nested/items")
 * @param viewModelInstance - The ViewModelInstance containing the list property
 * @returns An object with the list length and manipulation functions
 */
export default function useViewModelInstanceList(
	...rawArgs: unknown[]
): UseViewModelInstanceListResult {
	const [args, slot] = splitSlot(rawArgs);
	const path = args[0] as string;
	const viewModelInstance = args[1] as ViewModelInstance | null | undefined;

	// We track revision to trigger re-renders on list manipulation (e.g. addInstance, removeInstance, etc).
	// This is mostly important for things like the swap function which wouldn't trigger a re-render otherwise because it doesn't change the length of the list.
	// For example, if the user swaps two items in the list and we don't trigger a re-render, the user will see the old items if they were using the getInstanceAt function.
	// It also accounts for changes that happen within the Rive file itself rather than through the hook.
	const [, setRevision] = useState(0, subSlot(slot, 'revision'));

	const getProperty = useCallback(
		function readProperty(vm: ViewModelInstance, p: string) {
			return vm.list(p);
		},
		[],
		subSlot(slot, 'getProperty'),
	);
	const getValue = useCallback(
		function readValue(prop: ViewModelInstanceList) {
			return prop.length;
		},
		[],
		subSlot(slot, 'getValue'),
	);
	const buildPropertyOperations = useCallback(
		function buildOps(
			safePropertyAccess: (callback: (prop: ViewModelInstanceList) => void) => void,
		) {
			return {
				addInstance: function addInstance(instance: ViewModelInstance) {
					safePropertyAccess(function assign(prop) {
						prop.addInstance(instance);
					});
				},
				addInstanceAt: function addInstanceAt(instance: ViewModelInstance, index: number): boolean {
					let added = false;
					safePropertyAccess(function assign(prop) {
						added = prop.addInstanceAt(instance, index);
					});
					return added;
				},
				removeInstance: function removeInstance(instance: ViewModelInstance) {
					safePropertyAccess(function assign(prop) {
						prop.removeInstance(instance);
					});
				},
				removeInstanceAt: function removeInstanceAt(index: number) {
					safePropertyAccess(function assign(prop) {
						prop.removeInstanceAt(index);
					});
				},
				getInstanceAt: function getInstanceAt(index: number): ViewModelInstance | null {
					let found: ViewModelInstance | null = null;
					safePropertyAccess(function assign(prop) {
						found = prop.instanceAt(index);
					});
					return found;
				},
				swap: function swap(a: number, b: number) {
					safePropertyAccess(function assign(prop) {
						prop.swap(a, b);
					});
				},
			};
		},
		[],
		subSlot(slot, 'buildOps'),
	);

	const result = useViewModelInstanceProperty<
		ViewModelInstanceList,
		number,
		Omit<UseViewModelInstanceListResult, 'length'>
	>(
		path,
		viewModelInstance,
		{
			getProperty: getProperty,
			getValue: getValue,
			defaultValue: null,
			onPropertyEvent: function bumpRevision() {
				// This fires when the list changes in Rive
				setRevision(function increment(prev) {
					return prev + 1;
				});
			},
			buildPropertyOperations: buildPropertyOperations,
		},
		subSlot(slot, 'prop'),
	);

	return {
		length: result.value ?? 0,
		addInstance: result.addInstance,
		addInstanceAt: result.addInstanceAt,
		removeInstance: result.removeInstance,
		removeInstanceAt: result.removeInstanceAt,
		getInstanceAt: result.getInstanceAt,
		swap: result.swap,
	};
}
