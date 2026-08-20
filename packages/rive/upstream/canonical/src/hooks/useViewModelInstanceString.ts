import { useCallback } from 'react';
import { ViewModelInstance, ViewModelInstanceString } from '@rive-app/canvas';
import { UseViewModelInstanceStringResult } from '../types';
import { useViewModelInstanceProperty } from './useViewModelInstanceProperty';

/**
 * Hook for interacting with string properties of a ViewModelInstance.
 *
 * @param params - Parameters for interacting with string properties
 * @param params.path - Path to the property (e.g. "text" or "nested/text")
 * @param params.viewModelInstance - The ViewModelInstance containing the string property
 * @returns An object with the string value and a setter function
 */
export default function useViewModelInstanceString(
    path: string,
    viewModelInstance?: ViewModelInstance | null
): UseViewModelInstanceStringResult {

    const result = useViewModelInstanceProperty<ViewModelInstanceString, string, Omit<UseViewModelInstanceStringResult, 'value'>>(
        path,
        viewModelInstance,
        {
            getProperty: useCallback((vm, p) => vm.string(p), []),
            getValue: useCallback((prop) => prop.value, []),
            defaultValue: null,
            buildPropertyOperations: useCallback((safePropertyAccess) => ({
                setValue: (newValue: string) => {
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