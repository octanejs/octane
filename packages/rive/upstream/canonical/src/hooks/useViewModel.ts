import { useState, useEffect } from 'react';
import { Rive, ViewModel, EventType } from '@rive-app/canvas';
import { UseViewModelParameters } from '../types';

/**
 * Hook for fetching a ViewModel from a Rive instance.
 *
 * @param rive - The Rive instance to retrieve the ViewModel from
 * @param params - Options for retrieving a ViewModel
 * @param params.name - When provided, specifies the name of the ViewModel to retrieve
 * @param params.useDefault - When true, uses the default ViewModel from the Rive instance
 * @returns The ViewModel or null if not found
 */
export default function useViewModel(
    rive: Rive | null,
    params?: UseViewModelParameters
): ViewModel | null {
    const { name, useDefault = false } = params ?? {};
    const [viewModel, setViewModel] = useState<ViewModel | null>(null);

    useEffect(() => {
        function fetchViewModel() {
            if (!rive) {
                setViewModel(null);
                return;
            }

            let model: ViewModel | null = null;

            if (name != null) {
                model = rive.viewModelByName?.(name) || null;
            } else if (useDefault) {
                model = rive.defaultViewModel() || null;
            } else {
                model = rive.defaultViewModel() || null;
            }

            setViewModel(model);
        }

        fetchViewModel();

        if (rive) {
            rive.on(EventType.Load, fetchViewModel);
        }

        return () => {
            if (rive) {
                rive.off(EventType.Load, fetchViewModel);
            }
        };
    }, [rive, name, useDefault]);

    return viewModel;
} 