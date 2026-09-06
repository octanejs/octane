'use client';
import type * as React from 'octane';
import { usePreviewCardRootContext } from '../root/PreviewCardContext';
import { usePreviewCardPositionerContext } from '../positioner/PreviewCardPositionerContext';
import type { Align, Side } from '../../internals/useAnchorPositioning';
import type { BaseUIComponentProps } from '../../internals/types';
import { popupTransitionStateMapping } from '../../utils/popupStateMapping';
import type { TransitionStatus } from '../../internals/useTransitionStatus';
import { useOpenChangeComplete } from '../../internals/useOpenChangeComplete.tsrx';
import { useRenderElement } from '../../internals/useRenderElement.tsrx';
import { getDisabledMountTransitionStyles } from '../../internals/getDisabledMountTransitionStyles';
import { useHoverFloatingInteraction } from '../../floating-ui-react';
import { FOCUSABLE_POPUP_PROPS } from '../../utils/popups';

/**
 * A container for the preview card contents.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Preview Card](https://base-ui.com/react/components/preview-card)
 */
export const PreviewCardPopup = function PreviewCardPopup(
	componentPropsWithRef: React.PropsWithoutRef<PreviewCardPopup.Props> & {
		ref?: React.Ref<HTMLDivElement>;
	},
) {
	const { ref: forwardedRef = null, ...componentProps } = componentPropsWithRef;
	const { className, render, style, ...elementProps } = componentProps;

	const store = usePreviewCardRootContext();
	const { side, align } = usePreviewCardPositionerContext();

	const open = store.useState('open');
	const instantType = store.useState('instantType');
	const transitionStatus = store.useState('transitionStatus');
	const popupProps = store.useState('popupProps');
	const floatingContext = store.useState('floatingRootContext');
	const closeDelay = store.useState('closeDelay');

	useOpenChangeComplete({
		open,
		ref: store.context.popupRef,
		onComplete() {
			if (open) {
				store.context.onOpenChangeComplete?.(true);
			}
		},
	});

	useHoverFloatingInteraction(floatingContext, {
		closeDelay,
	});

	const state: PreviewCardPopupState = {
		open,
		side,
		align,
		instant: instantType,
		transitionStatus,
	};

	const element = useRenderElement('div', componentProps, {
		state,
		ref: [forwardedRef, store.context.popupRef, store.useStateSetter('popupElement')],
		props: [
			FOCUSABLE_POPUP_PROPS,
			popupProps,
			getDisabledMountTransitionStyles(transitionStatus),
			elementProps,
		],
		stateAttributesMapping: popupTransitionStateMapping,
	});

	return element;
};

export interface PreviewCardPopupState {
	/**
	 * Whether the preview card is currently open.
	 */
	open: boolean;
	/**
	 * The side of the anchor the component is placed on.
	 */
	side: Side;
	/**
	 * The alignment of the component relative to the anchor.
	 */
	align: Align;
	/**
	 * Whether transitions should be skipped.
	 */
	instant: 'dismiss' | 'focus' | undefined;
	/**
	 * The transition status of the component.
	 */
	transitionStatus: TransitionStatus;
}

export interface PreviewCardPopupProps extends BaseUIComponentProps<'div', PreviewCardPopupState> {}

export namespace PreviewCardPopup {
	export type State = PreviewCardPopupState;
	export type Props = PreviewCardPopupProps;
}
