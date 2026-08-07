import { memo, useEffect } from 'octane';
import { applyReactStyle } from '../utils/apply-react-style';
import { useControl } from './use-control';

import type { ControlPosition, NavigationControlOptions } from '../types/lib';
import type { CSSProperties } from '../types/octane';

export type NavigationControlProps = NavigationControlOptions & {
	/** Placement of the control relative to the map. */
	position?: ControlPosition;
	/** CSS style override, applied to the control's container */
	style?: CSSProperties;
};

function _NavigationControl(props: NavigationControlProps) {
	const ctrl = useControl(({ mapLib }) => new mapLib.NavigationControl(props), {
		position: props.position,
	});

	useEffect(() => {
		applyReactStyle(ctrl._container, props.style);
	}, [props.style]);

	return null;
}

export const NavigationControl = memo(_NavigationControl);
