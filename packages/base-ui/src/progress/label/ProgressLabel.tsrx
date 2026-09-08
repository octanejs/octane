'use client';
import type * as React from 'octane';
import { useRenderElement } from '../../internals/useRenderElement.tsrx';
import { useRegisteredLabelId } from '../../utils/useRegisteredLabelId';
import { useProgressRootContext } from '../root/ProgressRootContext.tsrx';
import { progressStateAttributesMapping } from '../root/stateAttributesMapping';
import type { ProgressRootState } from '../root/ProgressRoot.tsrx';
import type { BaseUIComponentProps } from '../../internals/types';

/**
 * An accessible label for the progress bar.
 * Renders a `<span>` element.
 *
 * Documentation: [Base UI Progress](https://base-ui.com/react/components/progress)
 */
export const ProgressLabel = function ProgressLabel(
	componentPropsWithRef: React.PropsWithoutRef<ProgressLabel.Props> & {
		ref?: React.Ref<HTMLSpanElement>;
	},
) {
	const { ref: forwardedRef = null, ...componentProps } = componentPropsWithRef;
	const { render, className, style, id: idProp, ...elementProps } = componentProps;

	const { setLabelId, state } = useProgressRootContext();

	const id = useRegisteredLabelId(idProp, setLabelId);

	const element = useRenderElement('span', componentProps, {
		state,
		ref: forwardedRef,
		props: [
			{
				id,
				role: 'presentation',
			},
			elementProps,
		],
		stateAttributesMapping: progressStateAttributesMapping,
	});

	return element;
};

export interface ProgressLabelState extends ProgressRootState {}

export interface ProgressLabelProps extends BaseUIComponentProps<'span', ProgressLabelState> {}

export namespace ProgressLabel {
	export type State = ProgressLabelState;
	export type Props = ProgressLabelProps;
}
