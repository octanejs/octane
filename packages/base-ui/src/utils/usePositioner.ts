// Ported from .base-ui/packages/react/src/utils/usePositioner.tsx (v1.6.0), octane-adapted
// (slot-threaded). Renders the shared outer Positioner `<div>` used by popup components: applies the
// `role="presentation"`, hidden state, positioning styles, disabled-mount-transition styles, popup
// state attributes, and optional `inert` pointer-events guard.
import { S, subSlot } from '../internal';
import { popupStateMapping } from './popupStateMapping';
import { useRenderElement } from './useRenderElement';
import { getDisabledMountTransitionStyles } from './getDisabledMountTransitionStyles';
import type { TransitionStatus } from './useTransitionStatus';

interface UsePositionerOptions {
	styles: Record<string, any>;
	transitionStatus: TransitionStatus;
	props?: Record<string, any> | undefined;
	refs?: any;
	hidden?: boolean | undefined;
	inert?: boolean | undefined;
}

export function usePositioner<State extends Record<string, any>>(
	componentProps: any,
	state: State,
	{ styles, transitionStatus, props, refs, hidden, inert = false }: UsePositionerOptions,
	slotArg?: symbol | undefined,
): any {
	const slot = slotArg ?? S('usePositioner');
	const style: Record<string, any> = { ...styles };

	if (inert) {
		style.pointerEvents = 'none';
	}

	return useRenderElement(
		'div',
		componentProps,
		{
			state,
			ref: refs,
			props: [
				{ role: 'presentation', hidden, style },
				getDisabledMountTransitionStyles(transitionStatus),
				props,
			],
			stateAttributesMapping: popupStateMapping,
		},
		subSlot(slot, 're'),
	);
}
