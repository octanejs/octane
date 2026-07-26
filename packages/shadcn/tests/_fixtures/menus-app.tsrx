// Menu-family fixtures: one composition per component family exercising the
// representative parts the contract tests assert on. Menu content portals to
// document.body, so tests query document-wide.
import { useState } from 'octane';
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuShortcut,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from '../../src/ui/dropdown-menu.tsrx';
import {
	ContextMenu,
	ContextMenuCheckboxItem,
	ContextMenuContent,
	ContextMenuGroup,
	ContextMenuItem,
	ContextMenuLabel,
	ContextMenuRadioGroup,
	ContextMenuRadioItem,
	ContextMenuSeparator,
	ContextMenuShortcut,
	ContextMenuSub,
	ContextMenuSubContent,
	ContextMenuSubTrigger,
	ContextMenuTrigger,
} from '../../src/ui/context-menu.tsrx';
import {
	Menubar,
	MenubarCheckboxItem,
	MenubarContent,
	MenubarItem,
	MenubarLabel,
	MenubarMenu,
	MenubarRadioGroup,
	MenubarRadioItem,
	MenubarSeparator,
	MenubarShortcut,
	MenubarSub,
	MenubarSubContent,
	MenubarSubTrigger,
	MenubarTrigger,
} from '../../src/ui/menubar.tsrx';
import {
	NavigationMenu,
	NavigationMenuContent,
	NavigationMenuIndicator,
	NavigationMenuItem,
	NavigationMenuLink,
	NavigationMenuList,
	NavigationMenuTrigger,
} from '../../src/ui/navigation-menu.tsrx';

export function DropdownMenuFixture() @{
	const [last, setLast] = useState('none');
	const [checked, setChecked] = useState(false);
	const [flavor, setFlavor] = useState('vanilla');
	<div>
		<span data-testid="last">{last}</span>
		<span data-testid="checked">{'' + checked}</span>
		<span data-testid="flavor">{flavor}</span>
		<DropdownMenu>
			<DropdownMenuTrigger data-testid="trigger">Open</DropdownMenuTrigger>
			<DropdownMenuContent data-testid="content" className="extra-content">
				<DropdownMenuLabel data-testid="label" inset>
					Actions
				</DropdownMenuLabel>
				<DropdownMenuGroup data-testid="group">
					<DropdownMenuItem data-testid="item-copy" onSelect={() => setLast('copy')}>
						Copy
						<DropdownMenuShortcut data-testid="shortcut">⌘C</DropdownMenuShortcut>
					</DropdownMenuItem>
					<DropdownMenuItem
						data-testid="item-delete"
						variant="destructive"
						disabled
						onSelect={() => setLast('delete')}
					>
						Delete
					</DropdownMenuItem>
				</DropdownMenuGroup>
				<DropdownMenuSeparator data-testid="separator" />
				<DropdownMenuCheckboxItem
					data-testid="item-check"
					checked={checked}
					onCheckedChange={setChecked}
				>
					Notifications
				</DropdownMenuCheckboxItem>
				<DropdownMenuRadioGroup data-testid="radio-group" value={flavor} onValueChange={setFlavor}>
					<DropdownMenuRadioItem data-testid="radio-vanilla" value="vanilla">
						Vanilla
					</DropdownMenuRadioItem>
					<DropdownMenuRadioItem data-testid="radio-chocolate" value="chocolate">
						Chocolate
					</DropdownMenuRadioItem>
				</DropdownMenuRadioGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	</div>
}

export function DropdownMenuSubFixture() @{
	const [last, setLast] = useState('none');
	<div>
		<span data-testid="last">{last}</span>
		<DropdownMenu>
			<DropdownMenuTrigger data-testid="trigger">More</DropdownMenuTrigger>
			<DropdownMenuContent data-testid="content">
				<DropdownMenuItem data-testid="item-new" onSelect={() => setLast('new')}>
					New
				</DropdownMenuItem>
				<DropdownMenuSub>
					<DropdownMenuSubTrigger data-testid="sub-trigger" inset>
						Share
					</DropdownMenuSubTrigger>
					<DropdownMenuSubContent data-testid="sub-content">
						<DropdownMenuItem data-testid="item-email" onSelect={() => setLast('email')}>
							Email
						</DropdownMenuItem>
					</DropdownMenuSubContent>
				</DropdownMenuSub>
			</DropdownMenuContent>
		</DropdownMenu>
	</div>
}

export function ContextMenuFixture() @{
	const [last, setLast] = useState('none');
	const [checked, setChecked] = useState(true);
	const [person, setPerson] = useState('pedro');
	<div>
		<span data-testid="last">{last}</span>
		<span data-testid="checked">{'' + checked}</span>
		<ContextMenu>
			<ContextMenuTrigger data-testid="trigger">Right click</ContextMenuTrigger>
			<ContextMenuContent data-testid="content">
				<ContextMenuLabel data-testid="label" inset>
					People
				</ContextMenuLabel>
				<ContextMenuGroup data-testid="group">
					<ContextMenuItem data-testid="item-reload" onSelect={() => setLast('reload')}>
						Reload
						<ContextMenuShortcut data-testid="shortcut">⌘R</ContextMenuShortcut>
					</ContextMenuItem>
				</ContextMenuGroup>
				<ContextMenuSeparator data-testid="separator" />
				<ContextMenuCheckboxItem
					data-testid="item-check"
					checked={checked}
					onCheckedChange={setChecked}
				>
					Show Bookmarks
				</ContextMenuCheckboxItem>
				<ContextMenuRadioGroup value={person} onValueChange={setPerson}>
					<ContextMenuRadioItem data-testid="radio-pedro" value="pedro">
						Pedro
					</ContextMenuRadioItem>
				</ContextMenuRadioGroup>
				<ContextMenuSub>
					<ContextMenuSubTrigger data-testid="sub-trigger">More Tools</ContextMenuSubTrigger>
					<ContextMenuSubContent data-testid="sub-content">
						<ContextMenuItem data-testid="item-save" onSelect={() => setLast('save')}>
							Save Page As…
						</ContextMenuItem>
					</ContextMenuSubContent>
				</ContextMenuSub>
			</ContextMenuContent>
		</ContextMenu>
	</div>
}

export function MenubarFixture() @{
	const [last, setLast] = useState('none');
	const [wordWrap, setWordWrap] = useState(false);
	const [profile, setProfile] = useState('benoit');
	<div>
		<span data-testid="last">{last}</span>
		<span data-testid="word-wrap">{'' + wordWrap}</span>
		<Menubar data-testid="menubar" className="extra-bar">
			<MenubarMenu>
				<MenubarTrigger data-testid="trigger-file">File</MenubarTrigger>
				<MenubarContent data-testid="content-file">
					<MenubarItem data-testid="item-new" onSelect={() => setLast('new')}>
						New Tab
						<MenubarShortcut data-testid="shortcut">⌘T</MenubarShortcut>
					</MenubarItem>
					<MenubarSeparator data-testid="separator" />
					<MenubarSub>
						<MenubarSubTrigger data-testid="sub-trigger">Share</MenubarSubTrigger>
						<MenubarSubContent data-testid="sub-content">
							<MenubarItem data-testid="item-email" onSelect={() => setLast('email')}>
								Email Link
							</MenubarItem>
						</MenubarSubContent>
					</MenubarSub>
				</MenubarContent>
			</MenubarMenu>
			<MenubarMenu>
				<MenubarTrigger data-testid="trigger-view">View</MenubarTrigger>
				<MenubarContent data-testid="content-view">
					<MenubarLabel data-testid="label" inset>
						Appearance
					</MenubarLabel>
					<MenubarCheckboxItem
						data-testid="item-wrap"
						checked={wordWrap}
						onCheckedChange={setWordWrap}
					>
						Word Wrap
					</MenubarCheckboxItem>
					<MenubarRadioGroup value={profile} onValueChange={setProfile}>
						<MenubarRadioItem data-testid="radio-benoit" value="benoit">
							Benoit
						</MenubarRadioItem>
					</MenubarRadioGroup>
				</MenubarContent>
			</MenubarMenu>
		</Menubar>
	</div>
}

export function NavigationMenuFixture() @{
	const [selected, setSelected] = useState('none');
	<div>
		<span data-testid="selected">{selected}</span>
		<NavigationMenu data-testid="root" aria-label="Main">
			<NavigationMenuList data-testid="list">
				<NavigationMenuItem data-testid="item-one" value="one">
					<NavigationMenuTrigger data-testid="trigger-one">Getting started</NavigationMenuTrigger>
					<NavigationMenuContent data-testid="content-one">
						<NavigationMenuLink
							data-testid="link-one"
							href="#one"
							onSelect={() => setSelected('one')}
						>
							Introduction
						</NavigationMenuLink>
					</NavigationMenuContent>
				</NavigationMenuItem>
				<NavigationMenuItem data-testid="item-two" value="two">
					<NavigationMenuTrigger data-testid="trigger-two">Components</NavigationMenuTrigger>
					<NavigationMenuContent data-testid="content-two">
						<NavigationMenuLink data-testid="link-two" href="#two">
							Alert Dialog
						</NavigationMenuLink>
					</NavigationMenuContent>
				</NavigationMenuItem>
				<NavigationMenuIndicator data-testid="indicator" />
			</NavigationMenuList>
		</NavigationMenu>
	</div>
}

export function NavigationMenuInlineFixture() @{
	<NavigationMenu data-testid="root" viewport={false}>
		<NavigationMenuList data-testid="list">
			<NavigationMenuItem value="one">
				<NavigationMenuTrigger data-testid="trigger-one">Docs</NavigationMenuTrigger>
				<NavigationMenuContent data-testid="content-one">
					<NavigationMenuLink data-testid="link-one" href="#docs">
						Docs Home
					</NavigationMenuLink>
				</NavigationMenuContent>
			</NavigationMenuItem>
		</NavigationMenuList>
	</NavigationMenu>
}
