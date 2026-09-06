'use client';
import * as React from 'octane';
import { error } from '@octanejs/base-ui-utils/error';
import type { SafeReact } from '@octanejs/base-ui-utils/safeReact';
import type { BaseUIComponentProps } from '../../internals/types';
import { useRenderElement } from '../../internals/useRenderElement.tsrx';
import type { FieldRoot } from '../../field/root/FieldRoot.tsrx';
import { useFieldRootContext } from '../../internals/field-root-context/FieldRootContext';
import { fieldValidityMapping } from '../../internals/field-constants/constants';
import { useLabel } from '../../internals/labelable-provider/useLabel';
import { getDefaultLabelId } from '../../utils/resolveAriaLabelledBy';
import { useComboboxRootContext } from '../root/ComboboxRootContext.tsrx';

/**
 * An accessible label that is automatically associated with the combobox trigger.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Combobox](https://base-ui.com/react/components/combobox)
 */
export const ComboboxLabel = function ComboboxLabel(
	componentPropsWithRef: React.PropsWithoutRef<ComboboxLabel.Props> & {
		ref?: React.Ref<HTMLDivElement>;
	},
) {
	const { ref: forwardedRef = null, ...componentProps } = componentPropsWithRef;
	const { render, className, style, ...elementProps } = componentProps;
	// Keep label id derived from the root and ignore runtime `id` overrides from untyped consumers.
	const elementPropsWithoutId = elementProps as typeof elementProps & { id?: string | undefined };
	delete elementPropsWithoutId.id;

	const fieldRootContext = useFieldRootContext();
	const store = useComboboxRootContext();

	const inputInsidePopup = store.useState('inputInsidePopup');
	const triggerElement = store.useState('triggerElement');
	const inputElement = store.useState('inputElement');
	const rootId = store.useState('id');
	const defaultLabelId = getDefaultLabelId(rootId);

	const localControlId = triggerElement?.id ?? (inputInsidePopup ? rootId : undefined);

	if (process.env.NODE_ENV !== 'production') {
		// eslint-disable-next-line react-hooks/rules-of-hooks
		React.useEffect(() => {
			if (!inputElement || inputInsidePopup) {
				return;
			}

			const ownerStackMessage = '';
			const message =
				'<Combobox.Label> labels <Combobox.Trigger> only. ' +
				'When <Combobox.Input> is the form control, use a native <label> or <Field.Label> instead.';
			error(`${message}${ownerStackMessage}`);
		}, [inputElement, inputInsidePopup]);
	}

	const labelProps = useLabel({
		id: defaultLabelId,
		fallbackControlId: localControlId,
		setLabelId(nextLabelId) {
			const resolvedLabelId =
				typeof nextLabelId === 'function' ? nextLabelId(store.state.labelId) : nextLabelId;
			store.set('labelId', resolvedLabelId);
		},
	});

	return useRenderElement('div', componentProps, {
		ref: forwardedRef,
		state: fieldRootContext.state,
		props: [labelProps, elementProps],
		stateAttributesMapping: fieldValidityMapping,
	});
};

export interface ComboboxLabelState extends FieldRoot.State {}

export interface ComboboxLabelProps extends Omit<
	BaseUIComponentProps<'div', ComboboxLabelState>,
	'id'
> {}

export namespace ComboboxLabel {
	export type State = ComboboxLabelState;
	export type Props = ComboboxLabelProps;
}

// Bundlers replace this expression; keep the build constant local to this module.
declare const process: { env: { NODE_ENV?: string } };
