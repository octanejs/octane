'use client';
import * as React from 'octane';
import * as ReactDOM from 'octane';
import { platform } from '@octanejs/base-ui-utils/platform';
import { ownerDocument } from '@octanejs/base-ui-utils/owner';
import { useNumberFieldRootContext } from '../root/NumberFieldRootContext';
import type { BaseUIComponentProps } from '../../internals/types';
import type { NumberFieldRootState } from '../root/NumberFieldRoot.tsrx';
import { stateAttributesMapping } from '../utils/stateAttributesMapping';
import { useNumberFieldScrubAreaContext } from '../scrub-area/NumberFieldScrubAreaContext';
import { useRenderElement } from '../../internals/useRenderElement.tsrx';

const CURSOR_STYLE: React.CSSProperties = {
	position: 'fixed',
	top: 0,
	left: 0,
	pointerEvents: 'none',
};

/**
 * A custom element to display instead of the native cursor while using the scrub area.
 * Renders a `<span>` element.
 *
 * This component uses the [Pointer Lock API](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_Lock_API), which may prompt the browser to display a related notification. It is disabled
 * in Safari to avoid a layout shift that this notification causes there.
 *
 * Documentation: [Base UI Number Field](https://base-ui.com/react/components/number-field)
 */
export const NumberFieldScrubAreaCursor = function NumberFieldScrubAreaCursor(
	componentPropsWithRef: React.PropsWithoutRef<NumberFieldScrubAreaCursor.Props> & {
		ref?: React.Ref<HTMLSpanElement>;
	},
) {
	const { ref: forwardedRef = null, ...componentProps } = componentPropsWithRef;
	const { render, className, style, ...elementProps } = componentProps;

	const { state } = useNumberFieldRootContext();
	const { isScrubbing, isTouchInput, isPointerLockDenied, scrubAreaCursorRef } =
		useNumberFieldScrubAreaContext();

	const [domElement, setDomElement] = React.useState<Element | null>(null);

	const shouldRender =
		isScrubbing && !platform.engine.webkit && !isTouchInput && !isPointerLockDenied;

	const element = useRenderElement('span', componentProps, {
		enabled: shouldRender,
		ref: [forwardedRef, scrubAreaCursorRef, setDomElement],
		state,
		props: [
			{
				role: 'presentation',
				style: CURSOR_STYLE,
			},
			elementProps,
		],
		stateAttributesMapping,
	});

	return element && ReactDOM.createPortal(element, ownerDocument(domElement).body);
};

export interface NumberFieldScrubAreaCursorState extends NumberFieldRootState {}

export interface NumberFieldScrubAreaCursorProps extends BaseUIComponentProps<
	'span',
	NumberFieldScrubAreaCursorState
> {}

export namespace NumberFieldScrubAreaCursor {
	export type State = NumberFieldScrubAreaCursorState;
	export type Props = NumberFieldScrubAreaCursorProps;
}
