import { useCallback } from 'react';
import { ViewModelInstance, ViewModelInstanceAssetImage } from '@rive-app/canvas';
import { UseViewModelInstanceImageResult, RiveRenderImage } from '../types';
import { useViewModelInstanceProperty } from './useViewModelInstanceProperty';

/**
 * Hook for interacting with image properties of a ViewModelInstance.
 *
 * @param path - Path to the image property (e.g. "profileImage" or "group/avatar")
 * @param viewModelInstance - The ViewModelInstance containing the image property
 * @returns An object with a setter function to set a new image value
 */
export default function useViewModelInstanceImage(
    path: string,
    viewModelInstance?: ViewModelInstance | null
): UseViewModelInstanceImageResult {
    const result = useViewModelInstanceProperty<ViewModelInstanceAssetImage, undefined, UseViewModelInstanceImageResult>(
        path,
        viewModelInstance,
        {
            getProperty: useCallback((vm, p) => vm.image(p), []),
            getValue: useCallback(() => undefined, []), // Images don't have a readable value
            defaultValue: null,
            buildPropertyOperations: useCallback((safePropertyAccess) => ({
                setValue: (newValue: RiveRenderImage | null) => {
                    safePropertyAccess(prop => { prop.value = newValue; });
                }
            }), [])
        }
    );

    return {
        setValue: result.setValue
    };
}