import { useEffect, useState } from 'octane';
import { EventType, type Rive, type ViewModel } from '@rive-app/canvas';
import type { UseViewModelParameters } from '../types.ts';
import { splitSlot, subSlot } from '../internal.ts';

/**
 * Hook for fetching a ViewModel from a Rive instance.
 *
 * @param rive - The Rive instance to retrieve the ViewModel from
 * @param params - Options for retrieving a ViewModel
 * @param params.name - When provided, specifies the name of the ViewModel to retrieve
 * @param params.useDefault - When true, uses the default ViewModel from the Rive instance
 * @returns The ViewModel or null if not found
 */
export default function useViewModel(...rawArgs: unknown[]): ViewModel | null {
	const [args, slot] = splitSlot(rawArgs);
	const rive = args[0] as Rive | null;
	const params = args[1] as UseViewModelParameters | undefined;
	const name = params?.name;
	const useDefault = params?.useDefault ?? false;

	const [viewModel, setViewModel] = useState<ViewModel | null>(null, subSlot(slot, 'model'));

	useEffect(
		function syncViewModel() {
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

			return function cleanup() {
				if (rive) {
					rive.off(EventType.Load, fetchViewModel);
				}
			};
		},
		[rive, name, useDefault],
		subSlot(slot, 'sync'),
	);

	return viewModel;
}
