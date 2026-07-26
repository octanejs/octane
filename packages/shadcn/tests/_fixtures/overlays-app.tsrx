// Overlay-family fixtures: one small composition per component, exercising the
// representative props the contract tests assert on. Overlay content portals to
// document.body, so tests query `document`, not the mount container.
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from '../../src/ui/dialog.tsrx';
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogMedia,
	AlertDialogTitle,
	AlertDialogTrigger,
} from '../../src/ui/alert-dialog.tsrx';
import {
	Sheet,
	SheetClose,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from '../../src/ui/sheet.tsrx';
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from '../../src/ui/tooltip.tsrx';
import {
	Popover,
	PopoverAnchor,
	PopoverContent,
	PopoverDescription,
	PopoverHeader,
	PopoverTitle,
	PopoverTrigger,
} from '../../src/ui/popover.tsrx';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '../../src/ui/hover-card.tsrx';

export function DialogFixture() @{
	<div>
		<Dialog>
			<DialogTrigger data-testid="dialog-trigger">Open dialog</DialogTrigger>
			<DialogContent data-testid="dialog-content" className="extra-content">
				<DialogHeader data-testid="dialog-header">
					<DialogTitle data-testid="dialog-title">Edit profile</DialogTitle>
					<DialogDescription data-testid="dialog-desc">Make changes here.</DialogDescription>
				</DialogHeader>
				<button data-testid="dialog-inner">inner</button>
				<DialogFooter showCloseButton={true} data-testid="dialog-footer">
					<DialogClose data-testid="dialog-cancel">Cancel</DialogClose>
				</DialogFooter>
			</DialogContent>
		</Dialog>
		<button data-testid="dialog-outside">outside</button>
	</div>
}

export function DialogNoCloseFixture() @{
	<Dialog>
		<DialogTrigger data-testid="dialog-trigger">Open dialog</DialogTrigger>
		<DialogContent data-testid="dialog-content" showCloseButton={false}>
			<DialogTitle data-testid="dialog-title">Bare</DialogTitle>
			<DialogDescription data-testid="dialog-desc">No close button.</DialogDescription>
		</DialogContent>
	</Dialog>
}

export function AlertDialogFixture() @{
	<AlertDialog>
		<AlertDialogTrigger data-testid="alert-trigger">Delete</AlertDialogTrigger>
		<AlertDialogContent size="sm" data-testid="alert-content">
			<AlertDialogHeader data-testid="alert-header">
				<AlertDialogMedia data-testid="alert-media">!</AlertDialogMedia>
				<AlertDialogTitle data-testid="alert-title">Are you absolutely sure?</AlertDialogTitle>
				<AlertDialogDescription data-testid="alert-desc">
					This action cannot be undone.
				</AlertDialogDescription>
			</AlertDialogHeader>
			<AlertDialogFooter data-testid="alert-footer">
				<AlertDialogCancel data-testid="alert-cancel">Cancel</AlertDialogCancel>
				<AlertDialogAction data-testid="alert-action" variant="destructive">
					Continue
				</AlertDialogAction>
			</AlertDialogFooter>
		</AlertDialogContent>
	</AlertDialog>
}

export function SheetFixture() @{
	<Sheet>
		<SheetTrigger data-testid="sheet-trigger">Open sheet</SheetTrigger>
		<SheetContent side="left" data-testid="sheet-content">
			<SheetHeader data-testid="sheet-header">
				<SheetTitle data-testid="sheet-title">Edit settings</SheetTitle>
				<SheetDescription data-testid="sheet-desc">Adjust preferences.</SheetDescription>
			</SheetHeader>
			<SheetFooter data-testid="sheet-footer">
				<SheetClose data-testid="sheet-cancel">Done</SheetClose>
			</SheetFooter>
		</SheetContent>
	</Sheet>
}

export function TooltipFixture() @{
	<TooltipProvider>
		<Tooltip>
			<TooltipTrigger data-testid="tooltip-trigger">Hover me</TooltipTrigger>
			<TooltipContent data-testid="tooltip-content" className="extra-tip">
				Tip text
			</TooltipContent>
		</Tooltip>
	</TooltipProvider>
}

export function PopoverFixture() @{
	<Popover>
		<PopoverTrigger data-testid="popover-trigger">Open popover</PopoverTrigger>
		<PopoverContent data-testid="popover-content" className="extra-pop">
			<PopoverHeader data-testid="popover-header">
				<PopoverTitle data-testid="popover-title">Dimensions</PopoverTitle>
				<PopoverDescription data-testid="popover-desc">Set the dimensions.</PopoverDescription>
			</PopoverHeader>
		</PopoverContent>
	</Popover>
}

export function PopoverWithAnchorFixture() @{
	<Popover>
		<PopoverAnchor data-testid="popover-anchor">
			<span>anchor here</span>
		</PopoverAnchor>
		<PopoverTrigger data-testid="popover-trigger">Open popover</PopoverTrigger>
		<PopoverContent data-testid="popover-content">Anchored content</PopoverContent>
	</Popover>
}

export function HoverCardFixture() @{
	<HoverCard openDelay={50} closeDelay={40}>
		<HoverCardTrigger data-testid="hover-trigger" href="#profile">
			@octane
		</HoverCardTrigger>
		<HoverCardContent data-testid="hover-content" className="extra-card">
			Profile preview
		</HoverCardContent>
	</HoverCard>
}
