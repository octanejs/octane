// @ts-nocheck -- fixture intentionally exercises React-compatible DOM prop boundaries.
import { useState } from 'octane';
import { Drawer } from '../../src/index.tsrx';

export function DrawerFixture() @{
	const [open, setOpen] = useState(false);
	function closeControlled() {
		setOpen(false);
	}
	<main>
		<output id="drawer-state">
			{open ? 'open' : 'closed'}
		</output>
		<button type="button" data-testid="controlled-close" onClick={closeControlled}>
			Controlled close
		</button>
		<Drawer.Root open={open} onOpenChange={setOpen}>
			<Drawer.Trigger>Open drawer</Drawer.Trigger>
			<Drawer.Portal>
				<Drawer.Overlay />
				<Drawer.Content>
					<Drawer.Title>Account settings</Drawer.Title>
					<Drawer.Description>Update your profile.</Drawer.Description>
					<Drawer.Close>Close drawer</Drawer.Close>
				</Drawer.Content>
			</Drawer.Portal>
		</Drawer.Root>
	</main>
}

export function ServerDrawerFixture() @{
	<Drawer.Root open={false}>
		<Drawer.Trigger>Open drawer</Drawer.Trigger>
		<Drawer.Portal>
			<Drawer.Content>
				<Drawer.Title>Server drawer</Drawer.Title>
				<Drawer.Description>Rendered on the server.</Drawer.Description>
			</Drawer.Content>
		</Drawer.Portal>
	</Drawer.Root>
}
