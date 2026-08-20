import { useCallback } from 'react';
import { ViewModelInstance, ViewModelInstanceAssetFont } from '@rive-app/canvas';
import { UseViewModelInstanceFontResult, RiveDecodedFont } from '../types';
import { useViewModelInstanceProperty } from './useViewModelInstanceProperty';

/**
 * Hook for interacting with font properties of a ViewModelInstance.
 *
 * @param path - Path to the font property (e.g. "boundFont" or "group/titleFont")
 * @param viewModelInstance - The ViewModelInstance containing the font property
 * @returns An object with a setter function to set a new font value
 */
export default function useViewModelInstanceFont(
    path: string,
    viewModelInstance?: ViewModelInstance | null
): UseViewModelInstanceFontResult {
    const result = useViewModelInstanceProperty<ViewModelInstanceAssetFont, undefined, UseViewModelInstanceFontResult>(
        path,
        viewModelInstance,
        {
            getProperty: useCallback((vm, p) => vm.font(p), []),
            getValue: useCallback(() => undefined, []),
            defaultValue: null,
            buildPropertyOperations: useCallback((safePropertyAccess) => ({
                setValue: (newValue: RiveDecodedFont | null) => {
                    safePropertyAccess(prop => {
                        // TODO: Can remove the type assertion once JS has value setter with FontWrapper
                        prop.value = newValue as unknown as typeof prop.value;
                    });
                }
            }), [])
        }
    );

    return {
        setValue: result.setValue
    };
}
