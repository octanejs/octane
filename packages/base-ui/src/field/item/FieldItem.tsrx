'use client';
import * as React from 'octane';
import { type FieldRootState } from '../root/FieldRoot.tsrx';
import { useFieldRootContext } from '../../internals/field-root-context/FieldRootContext';
import { fieldValidityMapping } from '../../internals/field-constants/constants';
import type { BaseUIComponentProps } from '../../internals/types';
import { useRenderElement } from '../../internals/useRenderElement.tsrx';
import { FieldItemContext } from './FieldItemContext';
import { LabelableProvider } from '../../internals/labelable-provider';

/**
 * Groups individual items in a checkbox group or radio group with a label and description.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Field](https://base-ui.com/react/components/field)
 */
export const FieldItem = function FieldItem(
	componentPropsWithRef: React.PropsWithoutRef<FieldItem.Props> & {
		ref?: React.Ref<HTMLDivElement>;
	},
) {
	const { ref: forwardedRef = null, ...componentProps } = componentPropsWithRef;
	const {
		render,
		className,
		style,
		disabled: disabledProp = false,
		...elementProps
	} = componentProps;

	const { state: fieldState, disabled: rootDisabled } = useFieldRootContext(false);

	const disabled = rootDisabled || disabledProp;
	const state: FieldItemState = { ...fieldState, disabled };

	const fieldItemContext: FieldItemContext = React.useMemo(() => ({ disabled }), [disabled]);

	const element = useRenderElement('div', componentProps, {
		ref: forwardedRef,
		state,
		props: elementProps,
		stateAttributesMapping: fieldValidityMapping,
	});

	return (
		<LabelableProvider>
			<FieldItemContext.Provider value={fieldItemContext}>{element}</FieldItemContext.Provider>
		</LabelableProvider>
	);
};

export interface FieldItemState extends FieldRootState {}

export interface FieldItemProps extends BaseUIComponentProps<'div', FieldItemState> {
	/**
	 * Whether the wrapped control should ignore user interaction.
	 * The `disabled` prop on `<Field.Root>` takes precedence over this.
	 * @default false
	 */
	disabled?: boolean | undefined;
}

export namespace FieldItem {
	export type State = FieldItemState;
	export type Props = FieldItemProps;
}
