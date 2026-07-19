import { useState } from 'octane';
import { Button } from '../../src/components/Button';
import { Header } from '../../src/components/Header';
import { Keyboard } from '../../src/components/Keyboard';
import {
	Menu,
	MenuItem,
	MenuSection,
	MenuTrigger,
	SubmenuTrigger,
} from '../../src/components/Menu';
import { Popover } from '../../src/components/Popover';
import { Separator } from '../../src/components/Separator';
import { Text } from '../../src/components/Text';

// Fixtures for the RAC Menu components over the Phase-4 collection engine and
// Phase-4 overlay composition: MenuTrigger provides trigger/menu props through
// context, the open Popover portals to document.body, and the Menu builds its
// collection from its children (static, sectioned, or dynamic).

export function BasicMenuHarness(props: {
	onAction?: (key: any) => void;
	onOpenChange?: (isOpen: boolean) => void;
}) {
	return (
		<MenuTrigger onOpenChange={props.onOpenChange}>
			<Button data-testid="trigger">Actions</Button>
			<Popover data-testid="popover">
				<Menu data-testid="menu" aria-label="Actions" onAction={props.onAction}>
					<MenuItem id="open" data-testid="item-open">
						Open
					</MenuItem>
					<MenuItem id="rename" data-testid="item-rename">
						Rename
					</MenuItem>
					<Separator data-testid="separator" />
					<MenuItem id="delete" data-testid="item-delete">
						Delete
					</MenuItem>
				</Menu>
			</Popover>
		</MenuTrigger>
	);
}

export function SelectionMenuHarness(props: {
	selectionMode: 'single' | 'multiple';
	onSelectionChange?: (keys: any) => void;
}) {
	return (
		<MenuTrigger>
			<Button data-testid="trigger">Align</Button>
			<Popover>
				<Menu
					data-testid="menu"
					aria-label="Alignment"
					selectionMode={props.selectionMode}
					defaultSelectedKeys={['left']}
					onSelectionChange={props.onSelectionChange}
				>
					<MenuItem id="left" data-testid="item-left">
						Left
					</MenuItem>
					<MenuItem id="center" data-testid="item-center">
						Center
					</MenuItem>
					<MenuItem id="right" data-testid="item-right">
						Right
					</MenuItem>
				</Menu>
			</Popover>
		</MenuTrigger>
	);
}

export function SectionMenuHarness() {
	return (
		<MenuTrigger>
			<Button data-testid="trigger">Edit</Button>
			<Popover>
				<Menu data-testid="menu" aria-label="Edit">
					<MenuSection data-testid="section-styles">
						<Header data-testid="styles-header">Styles</Header>
						<MenuItem id="bold" textValue="Bold" data-testid="item-bold">
							<Text slot="label">Bold</Text>
							<Keyboard>Meta+B</Keyboard>
						</MenuItem>
						<MenuItem id="italic">Italic</MenuItem>
					</MenuSection>
					<MenuSection aria-label="Clipboard" data-testid="section-clipboard">
						<MenuItem id="copy">Copy</MenuItem>
						<MenuItem id="paste">Paste</MenuItem>
					</MenuSection>
				</Menu>
			</Popover>
		</MenuTrigger>
	);
}

export function DynamicMenuHarness(props: { onAction?: (key: any) => void }) {
	const [items, setItems] = useState([
		{ id: 'cut', name: 'Cut' },
		{ id: 'copy', name: 'Copy' },
	]);
	return (
		<div>
			<button
				data-action="add"
				onClick={() => setItems((prev) => [...prev, { id: 'paste', name: 'Paste' }])}
			>
				add
			</button>
			<MenuTrigger>
				<Button data-testid="trigger">Edit</Button>
				<Popover>
					<Menu data-testid="menu" aria-label="Edit" items={items} onAction={props.onAction}>
						{(item: any) => <MenuItem id={item.id}>{item.name}</MenuItem>}
					</Menu>
				</Popover>
			</MenuTrigger>
		</div>
	);
}

export function SubmenuHarness(props: { onAction?: (key: any) => void }) {
	return (
		<MenuTrigger>
			<Button data-testid="trigger">Actions</Button>
			<Popover>
				<Menu data-testid="menu" aria-label="Actions" onAction={props.onAction}>
					<MenuItem id="open" data-testid="item-open">
						Open
					</MenuItem>
					<SubmenuTrigger>
						<MenuItem id="share" data-testid="item-share">
							Share
						</MenuItem>
						<Popover>
							<Menu data-testid="submenu" aria-label="Share" onAction={props.onAction}>
								<MenuItem id="email" data-testid="item-email">
									Email
								</MenuItem>
								<MenuItem id="sms" data-testid="item-sms">
									SMS
								</MenuItem>
							</Menu>
						</Popover>
					</SubmenuTrigger>
					<MenuItem id="delete" data-testid="item-delete">
						Delete
					</MenuItem>
				</Menu>
			</Popover>
		</MenuTrigger>
	);
}

export function EmptyMenuHarness() {
	return (
		<MenuTrigger>
			<Button data-testid="trigger">Empty</Button>
			<Popover>
				<Menu
					data-testid="menu"
					aria-label="Empty"
					items={[]}
					renderEmptyState={() => <span data-testid="empty">No actions</span>}
				>
					{(item: any) => <MenuItem id={item.id}>{item.name}</MenuItem>}
				</Menu>
			</Popover>
		</MenuTrigger>
	);
}
