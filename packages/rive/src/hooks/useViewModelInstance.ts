import { useEffect, useState } from 'octane';
import type { ViewModel, ViewModelInstance } from '@rive-app/canvas';
import type { UseViewModelInstanceParameters } from '../types.ts';
import { scheduleBind } from '../bindScheduler.ts';
import { resolveViewModelInstance } from '../resolveViewModelInstance.ts';
import { splitSlot, subSlot } from '../internal.ts';

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
export default function useViewModelInstance(...rawArgs: unknown[]): ViewModelInstance | null {
	const [args, slot] = splitSlot(rawArgs);
	const viewModel = args[0] as ViewModel | null;
	const params = args[1] as UseViewModelInstanceParameters | undefined;
	const name = params?.name;
	const useDefault = params?.useDefault ?? false;
	const useNew = params?.useNew ?? false;
	const rive = params?.rive;

	const [instance, setInstance] = useState<ViewModelInstance | null>(
		null,
		subSlot(slot, 'instance'),
	);

	useEffect(
		function syncInstance() {
			if (!viewModel) {
				setInstance(null);
				return;
			}

			// useDefault is the implicit default, so it needs no dedicated branch.
			const result = resolveViewModelInstance(viewModel, { name: name, useNew: useNew });

			setInstance(result);

			if (rive && result && rive.viewModelInstance !== result) {
				// Set the main instance (cheap) and schedule a coalesced bind() —
				// deduped with any other view model hook binding in the same commit,
				// rather than a full bind() per set. Equivalent to the previous
				// bindViewModelInstance(result), just batched.
				rive.setViewModelInstance(result);
				scheduleBind(rive);
			}
		},
		[viewModel, name, useDefault, useNew, rive],
		subSlot(slot, 'sync'),
	);

	return instance;
}
