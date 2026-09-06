'use client';
import * as React from 'octane';
import { FieldsetRootContext, useFieldsetRootContext } from './FieldsetRootContext';
import type { BaseUIComponentProps } from '../../internals/types';
import { useRenderElement } from '../../internals/useRenderElement.tsrx';

/**
 * Groups a shared legend with related controls.
 * Renders a `<fieldset>` element.
 *
 * Documentation: [Base UI Fieldset](https://base-ui.com/react/components/fieldset)
 */
export const FieldsetRoot = function FieldsetRoot(
	componentPropsWithRef: React.PropsWithoutRef<FieldsetRoot.Props> & {
		ref?: React.Ref<HTMLElement>;
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

	const [legendId, setLegendId] = React.useState<string | undefined>(undefined);

	const parentDisabled = useFieldsetRootContext(true)?.disabled;
	const disabled = parentDisabled || disabledProp;

	const state: FieldsetRootState = {
		disabled,
	};

	const element = useRenderElement('fieldset', componentProps, {
		ref: forwardedRef,
		state,
		props: [
			{
				'aria-labelledby': legendId,
				disabled,
			},
			elementProps,
		],
	});

	const contextValue: FieldsetRootContext = React.useMemo(
		() => ({
			legendId,
			setLegendId,
			disabled,
		}),
		[legendId, setLegendId, disabled],
	);

	return (
		<FieldsetRootContext.Provider value={contextValue}>{element}</FieldsetRootContext.Provider>
	);
};

export interface FieldsetRootState {
	/**
	 * Whether the component should ignore user interaction.
	 */
	disabled: boolean;
}

export interface FieldsetRootProps extends BaseUIComponentProps<'fieldset', FieldsetRootState> {}

export namespace FieldsetRoot {
	export type State = FieldsetRootState;
	export type Props = FieldsetRootProps;
}
