import { useRef } from 'octane';

import { useDialog } from '../../src/dialog/useDialog';
import type { AriaDialogProps } from '../../src/dialog/useDialog';

// A minimal, realistic dialog: a focusable container (tabIndex=-1) wired by useDialog,
// with a heading whose id is threaded back as aria-labelledby, and a button inside so
// "focus contained within the dialog" is observable. The consumer-visible contracts are
// the ARIA wiring (role, aria-labelledby ↔ title id, tabIndex=-1) and the mount autofocus
// (useDialog focuses the container via focusSafely unless focus is already within it).
export interface DialogHarnessProps extends AriaDialogProps {
	titleText?: string;
}

export function DialogHarness(props: DialogHarnessProps) {
	const ref = useRef<any>(null);
	const { dialogProps, titleProps } = useDialog(props, ref);
	const title = (props.titleText ?? 'Dialog title') as string;

	return (
		<div {...dialogProps} ref={ref} data-testid="dialog">
			<h2 {...titleProps} data-testid="title">
				{title}
			</h2>
			<button data-testid="inner">OK</button>
		</div>
	);
}
