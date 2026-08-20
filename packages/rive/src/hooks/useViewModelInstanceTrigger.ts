import { useCallback } from 'octane';
import type { ViewModelInstance, ViewModelInstanceTrigger } from '@rive-app/canvas';
import type {
	UseViewModelInstanceTriggerParameters,
	UseViewModelInstanceTriggerResult,
} from '../types.ts';
import { useViewModelInstanceProperty } from './useViewModelInstanceProperty.ts';
import { splitSlot, subSlot } from '../internal.ts';

/**
 * Hook for interacting with trigger properties of a ViewModelInstance.
 *
 * @param params - Parameters for interacting with trigger properties
 * @param params.path - Path to the trigger property (e.g. "onTap" or "group/onTap")
 * @param params.viewModelInstance - The ViewModelInstance containing the trigger property
 * @param params.onTrigger - Callback that runs when the trigger is fired
 * @returns An object with a trigger function
 */
export default function useViewModelInstanceTrigger(
	...rawArgs: unknown[]
): UseViewModelInstanceTriggerResult {
	const [args, slot] = splitSlot(rawArgs);
	const path = args[0] as string;
	const viewModelInstance = args[1] as ViewModelInstance | null | undefined;
	const params = args[2] as UseViewModelInstanceTriggerParameters | undefined;
	const onTrigger = params?.onTrigger;

	const getProperty = useCallback(
		function readProperty(vm: ViewModelInstance, p: string) {
			return vm.trigger(p);
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
			safePropertyAccess: (callback: (prop: ViewModelInstanceTrigger) => void) => void,
		) {
			return {
				trigger: function fireTrigger() {
					safePropertyAccess(function assign(prop) {
						prop.trigger();
					});
				},
			};
		},
		[],
		subSlot(slot, 'buildOps'),
	);

	const result = useViewModelInstanceProperty<
		ViewModelInstanceTrigger,
		undefined,
		UseViewModelInstanceTriggerResult
	>(
		path,
		viewModelInstance,
		{
			getProperty: getProperty,
			getValue: getValue,
			defaultValue: null,
			onPropertyEvent: onTrigger,
			buildPropertyOperations: buildPropertyOperations,
		},
		subSlot(slot, 'prop'),
	);

	return { trigger: result.trigger };
}
