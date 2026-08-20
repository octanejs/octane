import { useCallback } from 'react';
import { ViewModelInstance, ViewModelInstanceNumber } from '@rive-app/canvas';
import { UseViewModelInstanceNumberResult } from '../types';
import { useViewModelInstanceProperty } from './useViewModelInstanceProperty';

/**
 * Hook for interacting with number properties of a ViewModelInstance.
 *
 * @param params - Parameters for interacting with number properties
 * @param params.path - Path to the number property (e.g. "speed" or "group/speed")
 * @param params.viewModelInstance - The ViewModelInstance containing the number property
 * @returns An object with the number value and a setter function
 */
export default function useViewModelInstanceNumber(
    path: string,
    viewModelInstance?: ViewModelInstance | null
): UseViewModelInstanceNumberResult {
    const result = useViewModelInstanceProperty<ViewModelInstanceNumber, number, Omit<UseViewModelInstanceNumberResult, 'value'>>(
        path,
        viewModelInstance,
        {
            getProperty: useCallback((vm, p) => vm.number(p), []),
            getValue: useCallback((prop) => prop.value, []),
            defaultValue: null,
            buildPropertyOperations: useCallback((safePropertyAccess) => ({
                setValue: (newValue: number) => {
                    safePropertyAccess(prop => { prop.value = newValue; });
                }
            }), [])
        }
    );

    return {
        value: result.value,
        setValue: result.setValue
    };
} 