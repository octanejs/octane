import { useCallback } from 'react';
import { ViewModelInstance, ViewModelInstanceEnum } from '@rive-app/canvas';
import { UseViewModelInstanceEnumResult } from '../types';
import { useViewModelInstanceProperty } from './useViewModelInstanceProperty';

/**
 * Hook for interacting with enum properties of a ViewModelInstance.
 *
 * @param params - Parameters for interacting with enum properties
 * @param params.path - Path to the enum property (e.g. "state" or "group/state")
 * @param params.viewModelInstance - The ViewModelInstance containing the enum property
 * @returns An object with the enum value, available values, and a setter function
 */
export default function useViewModelInstanceEnum(
  path: string,
  viewModelInstance?: ViewModelInstance | null
): UseViewModelInstanceEnumResult {
  const result = useViewModelInstanceProperty<
    ViewModelInstanceEnum,
    string,
    Omit<UseViewModelInstanceEnumResult, 'value' | 'values'>,
    string[]
  >(path, viewModelInstance, {
    getProperty: useCallback((vm, p) => vm.enum(p), []),
    getValue: useCallback((prop) => prop.value, []),
    defaultValue: null,
    getExtendedData: useCallback((prop: any) => prop.values, []),
    buildPropertyOperations: useCallback(
      (safePropertyAccess) => ({
        setValue: (newValue: string) => {
          safePropertyAccess((prop) => {
            prop.value = newValue;
          });
        },
      }),
      []
    ),
  });

  return {
    value: result.value,
    values: result.extendedData || [],
    setValue: result.setValue,
  };
}
