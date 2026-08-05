import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from '@octanejs/shadcn/Dialog';
import { useState } from 'octane';

// Non-modal so the two side-by-side mounts do not fight over focus traps,
// aria-hidden, or body scroll locks. Preventing outside focus keeps one side's
// autofocus from dismissing the other side's overlay.
export function DialogApp() @{
	const [open, setOpen] = useState(false);
	<div>
		<Dialog modal={false} onOpenChange={setOpen}>
			<DialogTrigger id="dt">Edit profile</DialogTrigger>
			<DialogContent onFocusOutside={(event: Event) => event.preventDefault()}>
				<DialogHeader>
					<DialogTitle>Edit profile</DialogTitle>
					<DialogDescription>Make changes here.</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<DialogClose id="dx">Cancel</DialogClose>
				</DialogFooter>
			</DialogContent>
		</Dialog>
		<span id="dlg-state">{'dialog:' + (open ? 'open' : 'closed')}</span>
	</div>
}
