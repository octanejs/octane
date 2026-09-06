import * as React from 'octane';
import { useIsoLayoutEffect } from '@octanejs/base-ui-utils/useIsoLayoutEffect';
import { Dialog } from '@octanejs/base-ui/dialog';

export function DialogDetachedTriggerFixture1({
	handle,
}: {
	handle: ReturnType<typeof Dialog.createHandle>;
}) {
	return <React.Fragment>
		<Dialog.Root handle={handle} defaultOpen defaultTriggerId="trigger" />
		<Dialog.Trigger handle={handle} id="trigger">
			Trigger
		</Dialog.Trigger>
	</React.Fragment>;
}

export const createDialogHandle = () => Dialog.createHandle();
