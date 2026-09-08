import * as React from 'react';
import { describe, it, expect } from 'vitest';
import { createRenderer, screen, fireEvent, flushMicrotasks } from '@mui/internal-test-utils';
import { ContextMenu } from '@base-ui/react/context-menu';
import { Menu } from '@base-ui/react/menu';

describe('upstream menu contracts', () => {
	const { render } = createRenderer({ strict: false });
	it('uses the implicit vertical orientation of the menu role', async () => {
		const { user } = render(
			<Menu.Root>
				<Menu.Trigger>Open</Menu.Trigger>
				<Menu.Portal>
					<Menu.Positioner>
						<Menu.Popup>
							<Menu.Item>Item</Menu.Item>
						</Menu.Popup>
					</Menu.Positioner>
				</Menu.Portal>
			</Menu.Root>,
		);
		await user.click(screen.getByRole('button', { name: 'Open' }));
		expect(screen.getByRole('menu').getAttribute('aria-orientation')).toBeNull();
	});
	it.each([
		[120, 80, '1px 75px'],
		[400, 300, '1px 295px'],
	])('anchors at cursor %s,%s', async (x, y, origin) => {
		render(
			<ContextMenu.Root>
				<ContextMenu.Trigger>Target</ContextMenu.Trigger>
				<ContextMenu.Portal>
					<ContextMenu.Positioner data-testid="positioner">
						<ContextMenu.Popup>
							<ContextMenu.Item>Item</ContextMenu.Item>
						</ContextMenu.Popup>
					</ContextMenu.Positioner>
				</ContextMenu.Portal>
			</ContextMenu.Root>,
		);
		fireEvent.contextMenu(screen.getByText('Target'), { clientX: x, clientY: y, button: 2 });
		await flushMicrotasks();
		expect(screen.getByTestId('positioner').style.position).toBe('fixed');
		expect(screen.getByTestId('positioner').style.getPropertyValue('--transform-origin')).toBe(
			origin,
		);
	});
});
