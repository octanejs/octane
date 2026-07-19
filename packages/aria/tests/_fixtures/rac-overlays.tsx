import { Button } from '../../src/components/Button';
import { Dialog, DialogTrigger } from '../../src/components/Dialog';
import { Heading } from '../../src/components/Heading';
import { Modal } from '../../src/components/Modal';
import { OverlayArrow } from '../../src/components/OverlayArrow';
import { Popover } from '../../src/components/Popover';
import { Tooltip, TooltipTrigger } from '../../src/components/Tooltip';

// ---------------------------------------------------------------------------
// DialogTrigger + Modal + Dialog: pressing the trigger opens a modal dialog in
// a portal on document.body; the dialog is labeled by its title slot, receives
// focus, and closes via the slot="close" button, Escape, or (when dismissable)
// an interaction outside the modal content. The overlay tree renders through
// the trigger state (no conditional wrappers in the fixture — stable tree).
// ---------------------------------------------------------------------------

export interface ModalDialogProps {
	isDismissable?: boolean;
	isKeyboardDismissDisabled?: boolean;
}

export function ModalDialogScenario(props: ModalDialogProps) {
	return (
		<div>
			<span data-testid="outside">outside content</span>
			<DialogTrigger>
				<Button data-testid="trigger">Open dialog</Button>
				<Modal
					data-testid="modal"
					isDismissable={props.isDismissable}
					isKeyboardDismissDisabled={props.isKeyboardDismissDisabled}
				>
					<Dialog data-testid="dialog">
						<Heading slot="title">Account settings</Heading>
						<p>Dialog body</p>
						<Button slot="close" data-testid="close">
							Close
						</Button>
					</Dialog>
				</Modal>
			</DialogTrigger>
		</div>
	);
}

// ---------------------------------------------------------------------------
// DialogTrigger + Popover: the trigger is wired with aria-haspopup/aria-expanded/
// aria-controls; the open popover portals to document.body, reflects its computed
// placement as data-placement, and shares that placement with an OverlayArrow
// through context.
// ---------------------------------------------------------------------------

export function PopoverScenario() {
	return (
		<div>
			<DialogTrigger>
				<Button data-testid="popover-trigger">Open popover</Button>
				<Popover data-testid="popover">
					<OverlayArrow data-testid="arrow">
						<div className="arrow-shape" />
					</OverlayArrow>
					<Dialog data-testid="popover-dialog" aria-label="Popover contents">
						<p>Popover body</p>
					</Dialog>
				</Popover>
			</DialogTrigger>
		</div>
	);
}

// ---------------------------------------------------------------------------
// TooltipTrigger + Tooltip: keyboard focus opens immediately; hover opens after
// the warmup delay; the trigger is described by the tooltip while it is open.
// ---------------------------------------------------------------------------

export interface TooltipScenarioProps {
	delay?: number;
	closeDelay?: number;
}

export function TooltipScenario(props: TooltipScenarioProps) {
	return (
		<TooltipTrigger delay={props.delay ?? 0} closeDelay={props.closeDelay ?? 0}>
			<Button data-testid="tip-trigger">Save</Button>
			<Tooltip data-testid="tooltip">Saves your work</Tooltip>
		</TooltipTrigger>
	);
}
