/* global document */
import { memo, useEffect } from 'octane';
import { applyReactStyle } from '../utils/apply-react-style';
import { useControl } from './use-control';

import type { ControlPosition, FullscreenControlOptions } from '../types/lib';
import type { CSSProperties } from '../types/octane';

export type FullscreenControlProps = Omit<FullscreenControlOptions, 'container'> & {
	/** Id of the DOM element which should be made full screen. By default, the map container
	 * element will be made full screen. */
	containerId?: string;
	/** Placement of the control relative to the map. */
	position?: ControlPosition;
	/** CSS style override, applied to the control's container */
	style?: CSSProperties;
};

function _FullscreenControl(props: FullscreenControlProps) {
	const ctrl = useControl(
		({ mapLib }) =>
			new mapLib.FullscreenControl({
				container: props.containerId ? document.getElementById(props.containerId) : undefined,
			}),
		{ position: props.position },
	);

	useEffect(() => {
		applyReactStyle(ctrl._controlContainer, props.style);
	}, [props.style]);

	return null;
}

export const FullscreenControl = memo(_FullscreenControl);
