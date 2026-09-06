'use client';
import * as React from 'octane';
import { useMergedRefs } from '@octanejs/base-ui-utils/useMergedRefs';
import { visuallyHiddenInput } from '@octanejs/base-ui-utils/visuallyHidden';
import { useButton } from '../../internals/use-button';
import { createChangeEventDetails } from '../../internals/createBaseUIEventDetails';
import { REASONS } from '../../internals/reasons';
import { useComboboxRootContext } from '../root/ComboboxRootContext.tsrx';

type DismissEvent = React.MouseEvent<HTMLElement> | React.KeyboardEvent<HTMLElement>;

/**
 * @internal
 */
export const ComboboxInternalDismissButton = function ComboboxInternalDismissButton(
	_WithRef: React.PropsWithoutRef<{}> & { ref?: React.Ref<HTMLSpanElement> },
) {
	const { ref: forwardedRef = null, ..._ } = _WithRef;
	const store = useComboboxRootContext();

	const { buttonRef, getButtonProps } = useButton({
		native: false,
	});

	const mergedRef = useMergedRefs(forwardedRef, buttonRef);

	function handleDismiss(event: DismissEvent) {
		store.context.setOpen(
			false,
			createChangeEventDetails(REASONS.closePress, event, event.currentTarget),
		);
	}

	const dismissProps = getButtonProps({
		onClick: handleDismiss,
	});

	return (
		<span
			ref={mergedRef}
			{...dismissProps}
			aria-label="Dismiss"
			tabIndex={undefined}
			style={visuallyHiddenInput}
		/>
	);
};
