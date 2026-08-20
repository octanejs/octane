import { useCallback } from 'react';
import { ViewModelInstanceColor, ViewModelInstance } from '@rive-app/canvas';
import { UseViewModelInstanceColorResult } from '../types';
import { useViewModelInstanceProperty } from './useViewModelInstanceProperty';

/**
 * Hook for interacting with color properties of a ViewModelInstance.
 *
 * @param path - Path to the color property
 * @param viewModelInstance - The ViewModelInstance containing the color property
 * @returns An object with the color value and setter functions for different color formats
 */
export default function useViewModelInstanceColor(
    path: string,
    viewModelInstance?: ViewModelInstance | null
): UseViewModelInstanceColorResult {
    const result = useViewModelInstanceProperty<ViewModelInstanceColor, number, Omit<UseViewModelInstanceColorResult, 'value'>>(
        path,
        viewModelInstance,
        {
            getProperty: useCallback((vm, p) => vm.color(p), []),
            getValue: useCallback((prop) => prop.value, []),
            defaultValue: null,
            buildPropertyOperations: useCallback((safePropertyAccess) => ({
                setValue: (newValue: number) => {
                    safePropertyAccess(prop => { prop.value = newValue; });
                },

                setRgb: (r: number, g: number, b: number) => {
                    safePropertyAccess(prop => { prop.rgb(r, g, b); });
                },

                setRgba: (r: number, g: number, b: number, a: number) => {
                    safePropertyAccess(prop => { prop.rgba(r, g, b, a); });
                },

                setAlpha: (a: number) => {
                    safePropertyAccess(prop => { prop.alpha(a); });
                },

                setOpacity: (o: number) => {
                    safePropertyAccess(prop => { prop.opacity(o); });
                }
            }), [])
        }
    );

    return {
        value: result.value,
        setValue: result.setValue,
        setRgb: result.setRgb,
        setRgba: result.setRgba,
        setAlpha: result.setAlpha,
        setOpacity: result.setOpacity
    };
} 