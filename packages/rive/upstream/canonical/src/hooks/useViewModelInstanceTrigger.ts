import { useCallback } from 'react';
import { ViewModelInstance, ViewModelInstanceTrigger } from '@rive-app/canvas';
import { UseViewModelInstanceTriggerParameters, UseViewModelInstanceTriggerResult } from '../types';
import { useViewModelInstanceProperty } from './useViewModelInstanceProperty';

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
    path: string,
    viewModelInstance?: ViewModelInstance | null,
    params?: UseViewModelInstanceTriggerParameters
): UseViewModelInstanceTriggerResult {
    const { onTrigger } = params ?? {};

    const { trigger } = useViewModelInstanceProperty<ViewModelInstanceTrigger, undefined, UseViewModelInstanceTriggerResult>(
        path,
        viewModelInstance,
        {
            getProperty: useCallback((vm, p) => vm.trigger(p), []),
            getValue: useCallback(() => undefined, []), // Triggers don't have a 'value'
            defaultValue: null,
            onPropertyEvent: onTrigger,
            buildPropertyOperations: useCallback((safePropertyAccess) => ({
                trigger: () => {

                    safePropertyAccess(prop => {
                        prop.trigger();
                    });
                }
            }), [])
        }
    );

    return { trigger };
} 