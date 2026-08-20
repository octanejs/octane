import { useState, useEffect } from 'react';
import type { ViewModel, ViewModelInstance } from '@rive-app/canvas';
import { UseViewModelInstanceParameters } from '../types';
import { scheduleBind } from '../bindScheduler';
import { resolveViewModelInstance } from '../resolveViewModelInstance';

/**
 * Hook for fetching a ViewModelInstance from a ViewModel.
 *
 * @param viewModel - The ViewModel to get an instance from
 * @param params - Options for retrieving a ViewModelInstance
 * @param params.name - When provided, specifies the name of the instance to retrieve
 * @param params.useDefault - When true, uses the default instance from the ViewModel
 * @param params.useNew - When true, creates a new instance of the ViewModel
 * @param params.rive - If provided, automatically binds the instance to this Rive instance
 * @returns The ViewModelInstance or null if not found
 */
export default function useViewModelInstance(
    viewModel: ViewModel | null,
    params?: UseViewModelInstanceParameters
): ViewModelInstance | null {
    const { name, useDefault = false, useNew = false, rive } = params ?? {};
    const [instance, setInstance] = useState<ViewModelInstance | null>(null);

    useEffect(() => {
        if (!viewModel) {
            setInstance(null);
            return;
        }

        // useDefault is the implicit default, so it needs no dedicated branch.
        const result = resolveViewModelInstance(viewModel, { name, useNew });

        setInstance(result);

        if (rive && result && rive.viewModelInstance !== result) {
            // Set the main instance (cheap) and schedule a coalesced bind() —
            // deduped with any other view model hook binding in the same commit,
            // rather than a full bind() per set. Equivalent to the previous
            // bindViewModelInstance(result), just batched.
            rive.setViewModelInstance(result);
            scheduleBind(rive);
        }
    }, [viewModel, name, useDefault, useNew, rive]);

    return instance;
} 