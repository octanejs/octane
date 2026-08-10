import { memo, useEffect, useRef } from 'octane';
import { applyReactStyle } from '../utils/apply-react-style';
import { useControl } from './use-control';

import type { ControlPosition, ScaleControlOptions } from '../types/lib';
import type { CSSProperties } from '../types/octane';

export type ScaleControlProps = ScaleControlOptions & {
	// These props will be further constraint by OptionsT
	unit?: string;
	maxWidth?: number;

	/** Placement of the control relative to the map. */
	position?: ControlPosition;
	/** CSS style override, applied to the control's container */
	style?: CSSProperties;
};

function _ScaleControl(props: ScaleControlProps) {
	const ctrl = useControl(({ mapLib }) => new mapLib.ScaleControl(props), {
		position: props.position,
	});
	const propsRef = useRef<ScaleControlProps>(props);

	const prevProps = propsRef.current;
	propsRef.current = props;

	const { style } = props;

	if (props.maxWidth !== undefined && props.maxWidth !== prevProps.maxWidth) {
		ctrl.options.maxWidth = props.maxWidth;
	}
	if (props.unit !== undefined && props.unit !== prevProps.unit) {
		ctrl.setUnit(props.unit);
	}

	useEffect(() => {
		applyReactStyle(ctrl._container, style);
	}, [style]);

	return null;
}

export const ScaleControl = memo(_ScaleControl);
