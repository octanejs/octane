import { useState, useEffect } from 'react';
import type { ViewModel, ViewModelInstance } from '@rive-app/canvas';
import { UseGlobalViewModelInstanceParameters } from '../types';
import { scheduleBind } from '../bindScheduler';
import { resolveViewModelInstance } from '../resolveViewModelInstance';

/**
 * Creates and binds a *global* view model instance. Resolves an
 * instance from `viewModel` — default, or `{ useNew }` / `{ instanceName }` /
 * `{ instance }` (a caller-supplied view model instance). When
 * `params.rive` is set, registers it as the global `name` and schedules a
 * coalesced bind (see {@link scheduleBind}).
 *
 * To read an already-bound global view model instance instead, query rive directly
 * (rive.globalViewModelInstance(name)).
 *
 * @param viewModel - ViewModel to resolve from (e.g. from useViewModel). May be
 *   null while it loads, or when supplying `params.instance` directly.
 * @param name - Name of the global view model to register under.
 * @param params - Which instance to resolve, and the Rive instance to register with.
 * @returns The resolved ViewModelInstance, or null if unavailable.
 */
export default function useGlobalViewModelInstance(
    viewModel: ViewModel | null,
    name: string,
    params?: UseGlobalViewModelInstanceParameters
): ViewModelInstance | null {
    const { instanceName, useNew = false, instance, rive } = params ?? {};
    const [resolvedInstance, setResolvedInstance] =
        useState<ViewModelInstance | null>(null);

    useEffect(() => {
        // A null viewModel (with no supplied instance) means "not ready yet".
        const result = resolveViewModelInstance(viewModel, {
            name: instanceName,
            useNew,
            instance,
        });

        setResolvedInstance(result);

        // Register as the global for `name` and schedule a coalesced bind
        // (deduped with any other view model hook binding in the same commit).
        if (rive && name && result) {
            const didSet = rive.setGlobalViewModelInstance(name, result);
            if (didSet) {
                scheduleBind(rive);
            }
        }
    }, [viewModel, name, instanceName, useNew, instance, rive]);

    return resolvedInstance;
}
