import { useCallback } from 'react';
import { ViewModelInstanceBoolean, ViewModelInstance } from '@rive-app/canvas';
import { UseViewModelInstanceBooleanResult } from '../types';
import { useViewModelInstanceProperty } from './useViewModelInstanceProperty';

/**
 * Hook for interacting with boolean ViewModel instance properties.
 *
 * @param path - The path to the boolean property
 * @param viewModelInstance - The ViewModelInstance containing the boolean property to operate on
 * @returns An object with the boolean value and a setter function
 */
export default function useViewModelInstanceBoolean(
    path: string,
    viewModelInstance?: ViewModelInstance | null
): UseViewModelInstanceBooleanResult {
    const result = useViewModelInstanceProperty<ViewModelInstanceBoolean, boolean, Omit<UseViewModelInstanceBooleanResult, 'value'>>(
        path,
        viewModelInstance,
        {
            getProperty: useCallback((vm, p) => vm.boolean(p), []),
            getValue: useCallback((prop) => prop.value, []),
            defaultValue: null,
            buildPropertyOperations: useCallback((safePropertyAccess) => ({
                setValue: (newValue: boolean) => {
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