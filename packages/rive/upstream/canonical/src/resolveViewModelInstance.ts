import type { ViewModel, ViewModelInstance } from '@rive-app/canvas';

/**
 * Resolves a ViewModelInstance from a ViewModel. Shared by useViewModelInstance
 * and useGlobalViewModelInstance so the selector lives in one place.
 *
 * - `instance` present (even as null) is used directly — the caller-supplied
 *   path; a null value means "not ready yet".
 * - otherwise, with a view model: `name` -> instanceByName, `useNew` -> a new
 *   instance, else the default instance. A null view model resolves to null.
 */
export function resolveViewModelInstance(
    viewModel: ViewModel | null,
    params: {
        name?: string | null;
        useNew?: boolean;
        instance?: ViewModelInstance | null;
    }
): ViewModelInstance | null {
    const { name, useNew, instance } = params;
    if (instance !== undefined) {
        return instance;
    }
    if (!viewModel) {
        return null;
    }
    if (name != null) {
        return viewModel.instanceByName(name) || null;
    }
    if (useNew) {
        return viewModel.instance?.() || null;
    }
    return viewModel.defaultInstance?.() || null;
}
