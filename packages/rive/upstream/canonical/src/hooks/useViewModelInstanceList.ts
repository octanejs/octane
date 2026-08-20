import { useCallback, useState } from 'react';
import { ViewModelInstance, ViewModelInstanceList } from '@rive-app/canvas';
import { UseViewModelInstanceListResult } from '../types';
import { useViewModelInstanceProperty } from './useViewModelInstanceProperty';

/**
 * Hook for interacting with list properties of a ViewModelInstance.
 *
 * @param path - Path to the property (e.g. "items" or "nested/items")
 * @param viewModelInstance - The ViewModelInstance containing the list property
 * @returns An object with the list length and manipulation functions
 */
export default function useViewModelInstanceList(
    path: string,
    viewModelInstance?: ViewModelInstance | null
): UseViewModelInstanceListResult {

    // We track revision to trigger re-renders on list manipulation (e.g. addInstance, removeInstance, etc).
    // This is mostly important for things like the swap function which wouldn't trigger a re-render otherwise because it doesn't change the length of the list.
    // For example, if the user swaps two items in the list and we don't trigger a re-render, the user will see the old items if they were using the getInstanceAt function.
    // It also accounts for changes that happen within the Rive file itself rather than through the hook.
    const [, setRevision] = useState(0);

    const result = useViewModelInstanceProperty<ViewModelInstanceList, number, Omit<UseViewModelInstanceListResult, 'length'>>(
        path,
        viewModelInstance,
        {
            getProperty: useCallback((vm, p) => vm.list(p), []),
            getValue: useCallback((prop) => prop.length, []),
            defaultValue: null,
            onPropertyEvent: () => {
                // This fires when the list changes in Rive
                setRevision(prev => prev + 1);
            },
            buildPropertyOperations: useCallback((safePropertyAccess) => ({
                addInstance: (instance: ViewModelInstance) => {
                    safePropertyAccess(prop => prop.addInstance(instance));
                },
                addInstanceAt: (instance: ViewModelInstance, index: number): boolean => {
                    let result = false;
                    safePropertyAccess(prop => {
                        result = prop.addInstanceAt(instance, index);
                    });
                    return result;
                },
                removeInstance: (instance: ViewModelInstance) => {
                    safePropertyAccess(prop => prop.removeInstance(instance));
                },
                removeInstanceAt: (index: number) => {
                    safePropertyAccess(prop => prop.removeInstanceAt(index));
                },
                getInstanceAt: (index: number): ViewModelInstance | null => {
                    let result: ViewModelInstance | null = null;
                    safePropertyAccess(prop => {
                        result = prop.instanceAt(index);
                    });
                    return result;
                },
                swap: (a: number, b: number) => {
                    safePropertyAccess(prop => prop.swap(a, b));
                }
            }), [])
        }
    );

    return {
        length: result.value ?? 0,
        addInstance: result.addInstance,
        addInstanceAt: result.addInstanceAt,
        removeInstance: result.removeInstance,
        removeInstanceAt: result.removeInstanceAt,
        getInstanceAt: result.getInstanceAt,
        swap: result.swap
    };
}