import { Badge } from '@octanejs/shadcn/Badge';
import { Button } from '@octanejs/shadcn/Button';
import {
	Dialog,
	DialogTrigger,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
	DialogFooter,
	DialogClose,
} from '@octanejs/shadcn/Dialog';
import {
	DropdownMenu,
	DropdownMenuTrigger,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuLabel,
	DropdownMenuItem,
	DropdownMenuCheckboxItem,
	DropdownMenuSeparator,
	DropdownMenuShortcut,
} from '@octanejs/shadcn/DropdownMenu';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@octanejs/shadcn/Tabs';
import { createElement, useState } from 'octane';

// Self-contained fixtures for the differential rig: the SAME source runs on
// octane (via @octanejs/shadcn) AND on React (the setup rewrites the import to
// the vendored pinned upstream shadcn sources), and the rig asserts
// byte-identical innerHTML after each step.
//
// asChild children are composed with createElement — the documented radix Slot
// contract on BOTH sides (real radix Slot clones a single element; an opaque
// compiled .tsrx child is not a descriptor).

export function BadgeGallery() @{
	<div>
		<Badge id="b-def">New</Badge>
		<Badge variant="secondary">Beta</Badge>
		<Badge variant="destructive">Err</Badge>
		<Badge variant="outline">Out</Badge>
		<Badge variant="ghost">Ghost</Badge>
		<Badge variant="link">Link</Badge>
		<Badge variant="secondary" className="custom-badge px-4">Merged</Badge>
		<Badge
			asChild
			variant="outline"
			children={createElement('a', { id: 'b-link', href: '#profile' }, 'Profile')}
		/>
	</div>
}

export function ButtonApp() @{
	const [count, setCount] = useState(0);
	<div>
		<Button id="btn" onClick={() => setCount((c: number) => c + 1)}>{'count:' + count}</Button>
		<Button variant="destructive" size="sm">Delete</Button>
		<Button variant="outline" size="lg" className="w-full">Wide</Button>
		<Button variant="ghost" size="icon" disabled>i</Button>
		<Button variant="link" size="xs">More</Button>
		<Button
			asChild
			variant="secondary"
			size="sm"
			children={createElement('a', { id: 'btn-link', href: '#docs' }, 'Docs')}
		/>
	</div>
}

export function TabsApp() @{
	<Tabs defaultValue="one">
		<TabsList>
			<TabsTrigger id="t1" value="one">One</TabsTrigger>
			<TabsTrigger id="t2" value="two">Two</TabsTrigger>
		</TabsList>
		<TabsContent value="one">first-panel</TabsContent>
		<TabsContent value="two">second-panel</TabsContent>
	</Tabs>
}

// Non-modal so the two side-by-side mounts (octane + React in one document)
// don't fight over focus traps / aria-hidden / body scroll locks — modal
// specifics are unit-tested. `onFocusOutside` is prevented because a non-modal
// overlay dismisses on ANY outside focusin BY DESIGN — and each side's
// open-autofocus is an "outside focus" to the OTHER side's overlay (the same
// rationale as radix's differential DialogNonModal fixture).
export function DialogApp() @{
	const [open, setOpen] = useState(false);
	<div>
		<Dialog modal={false} onOpenChange={setOpen}>
			<DialogTrigger id="dt">Edit profile</DialogTrigger>
			<DialogContent onFocusOutside={(e) => e.preventDefault()}>
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

export function DropdownApp() @{
	const [checked, setChecked] = useState(false);
	const [last, setLast] = useState('none');
	<div>
		<DropdownMenu modal={false}>
			<DropdownMenuTrigger id="mt">Open menu</DropdownMenuTrigger>
			<DropdownMenuContent onFocusOutside={(e) => e.preventDefault()}>
				<DropdownMenuLabel inset>Actions</DropdownMenuLabel>
				<DropdownMenuGroup>
					<DropdownMenuItem id="mi-copy" onSelect={() => setLast('copy')}>
						Copy
						<DropdownMenuShortcut>⌘C</DropdownMenuShortcut>
					</DropdownMenuItem>
					<DropdownMenuItem id="mi-del" variant="destructive" disabled>Delete</DropdownMenuItem>
				</DropdownMenuGroup>
				<DropdownMenuSeparator />
				<DropdownMenuCheckboxItem id="mi-check" checked={checked} onCheckedChange={setChecked}>
					Notifications
				</DropdownMenuCheckboxItem>
			</DropdownMenuContent>
		</DropdownMenu>
		<span id="dd-state">{'checked:' + checked + ' last:' + last}</span>
	</div>
}
