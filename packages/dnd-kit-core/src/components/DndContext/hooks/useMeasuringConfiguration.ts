import { useMemo } from 'octane';
import type { DeepRequired } from '@octanejs/dnd-kit-utilities';

import { defaultMeasuringConfiguration } from '../defaults';
import type { MeasuringConfiguration } from '../types';

export function useMeasuringConfiguration(
	config: MeasuringConfiguration | undefined,
): DeepRequired<MeasuringConfiguration> {
	return useMemo(
		() => ({
			draggable: {
				...defaultMeasuringConfiguration.draggable,
				...config?.draggable,
			},
			droppable: {
				...defaultMeasuringConfiguration.droppable,
				...config?.droppable,
			},
			dragOverlay: {
				...defaultMeasuringConfiguration.dragOverlay,
				...config?.dragOverlay,
			},
		}),
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[config?.draggable, config?.droppable, config?.dragOverlay],
	);
}
