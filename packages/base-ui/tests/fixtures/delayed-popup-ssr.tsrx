import { Suspense, useState } from 'octane';
import { Dialog } from '@octanejs/base-ui/dialog';
import { Tooltip } from '@octanejs/base-ui/tooltip';

export interface HydrationGate {
	suspend: boolean;
	promise: Promise<void>;
}
function DelayedDialogTrigger({
	handle,
	gate,
}: {
	handle: ReturnType<typeof Dialog.createHandle>;
	gate: HydrationGate;
}) {
	if (gate.suspend) throw gate.promise;
	return <Dialog.Trigger handle={handle} id="trigger">Trigger</Dialog.Trigger>;
}
export function DelayedDialogFixture({
	handle,
	gate,
}: {
	handle: ReturnType<typeof Dialog.createHandle>;
	gate: HydrationGate;
}) {
	return <>
		<Dialog.Root handle={handle} defaultOpen defaultTriggerId="trigger" />
		<Suspense fallback="Loading">
			<DelayedDialogTrigger handle={handle} gate={gate} />
		</Suspense>
	</>;
}
function DelayedTooltipTrigger({
	handle,
	gate,
}: {
	handle: ReturnType<typeof Tooltip.createHandle>;
	gate: HydrationGate;
}) {
	if (gate.suspend) throw gate.promise;
	return <Tooltip.Trigger handle={handle} id="trigger">Trigger</Tooltip.Trigger>;
}
export function DelayedTooltipFixture({
	handle,
	gate,
}: {
	handle: ReturnType<typeof Tooltip.createHandle>;
	gate: HydrationGate;
}) {
	return <>
		<Tooltip.Root handle={handle} defaultOpen defaultTriggerId="trigger" />
		<Suspense fallback="Loading">
			<DelayedTooltipTrigger handle={handle} gate={gate} />
		</Suspense>
	</>;
}
export function TooltipTriggerBFixture({
	handle,
}: {
	handle: ReturnType<typeof Tooltip.createHandle>;
}) {
	return <Tooltip.Trigger handle={handle} id="trigger-b">Trigger B</Tooltip.Trigger>;
}
export function TooltipOwnershipFixture({
	handle,
	onOpenChange,
}: {
	handle: ReturnType<typeof Tooltip.createHandle>;
	onOpenChange: NonNullable<Tooltip.Root.Props['onOpenChange']>;
}) {
	const [open, setOpen] = useState(true);
	const [activeTriggerId, setActiveTriggerId] = useState('trigger-a');
	return <>
		<button type="button" onClick={() => setActiveTriggerId('trigger-b')}>Switch to B</button>
		<Tooltip.Root
			handle={handle}
			open={open}
			triggerId={activeTriggerId}
			onOpenChange={(nextOpen, eventDetails) => {
				onOpenChange(nextOpen, eventDetails);
				setOpen(nextOpen);
			}}
		/>
		{activeTriggerId === 'trigger-a' &&
			<Tooltip.Trigger handle={handle} id="trigger-a">Trigger A</Tooltip.Trigger>}
	</>;
}

export const createDialogHandle = () => Dialog.createHandle();
export const createTooltipHandle = () => Tooltip.createHandle();
