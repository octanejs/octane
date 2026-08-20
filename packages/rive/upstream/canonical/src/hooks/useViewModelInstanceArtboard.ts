import { useCallback } from 'react';
import { ViewModelInstance, ViewModelInstanceArtboard } from '@rive-app/canvas';
import { UseViewModelInstanceArtboardResult } from '../types';
import { useViewModelInstanceProperty } from './useViewModelInstanceProperty';

/**
 * Hook for interacting with artboard properties of a ViewModelInstance.
 *
 * @param path - Path to the artboard property (e.g. "targetArtboard" or "group/artboard")
 * @param viewModelInstance - The ViewModelInstance containing the artboard property
 * @returns An object with a setter function
 */
export default function useViewModelInstanceArtboard(
    path: string,
    viewModelInstance?: ViewModelInstance | null
): UseViewModelInstanceArtboardResult {
    const result = useViewModelInstanceProperty<ViewModelInstanceArtboard, undefined, UseViewModelInstanceArtboardResult>(
        path,
        viewModelInstance,
        {
            getProperty: useCallback((vm, p) => vm.artboard(p), []),
            getValue: useCallback(() => undefined, []), // Artboards properties don't currently have a readable value
            defaultValue: null,
            buildPropertyOperations: useCallback((safePropertyAccess) => ({
                setValue: (newValue) => {
                    safePropertyAccess(prop => { prop.value = newValue; });
                }
            }), [])
        }
    );

    return {
        setValue: result.setValue
    };
}