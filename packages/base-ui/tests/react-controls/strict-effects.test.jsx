// React oracle: establishes the upstream Strict Mode callback multiplier.
import * as React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { createRenderer, screen, flushMicrotasks } from '@mui/internal-test-utils';
import { Menu } from '@base-ui/react/menu';

describe.each([false, true])('upstream Strict Mode effects: %s', (strict) => {
	const { render } = createRenderer({ strict });
	it('counts completion of an unanimated menu mount', async () => {
		const completed = vi.fn();
		function Example() {
			const [open, setOpen] = React.useState(false);
			return (
				<>
					<button onClick={() => setOpen(true)}>Open</button>
					<Menu.Root open={open} onOpenChangeComplete={completed}>
						<Menu.Trigger>Trigger</Menu.Trigger>
						<Menu.Portal>
							<Menu.Positioner>
								<Menu.Popup>
									<Menu.Item>Item</Menu.Item>
								</Menu.Popup>
							</Menu.Positioner>
						</Menu.Portal>
					</Menu.Root>
				</>
			);
		}
		const { user } = render(<Example />);
		await user.click(screen.getByRole('button', { name: 'Open' }));
		await flushMicrotasks();
		expect(completed.mock.calls.map(([open]) => open)).toEqual(strict ? [true, true] : [true]);
	});
});
